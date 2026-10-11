import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { getAccessibleStore, requirePermission } from "../tenant";

// Métricas da conta (Etapa 3): vitrine (visualizações, cliques no WhatsApp, compartilhamentos, acessos por QR),
// origem dos acessos, campanhas e exportações. Tudo agregado no banco (SQL), sempre filtrado por ctx.orgId
// e pelas lojas a que o membro tem acesso. Dias no fuso America/Sao_Paulo.
// Cliques no WhatsApp são INTERESSE, não vendas: a interface deixa isso claro.

export const METRICS_TZ = "America/Sao_Paulo";
export const METRICS_PERIODS = [7, 30, 90] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

export interface EventCounts { views: number; whatsappClicks: number; shares: number; qrAccesses: number }
export interface MetricsDay extends EventCounts { date: string }
export interface MetricsOriginRow { source: string | null; views: number; whatsappClicks: number; shares: number }
export interface MetricsCampaignRow { campaignId: string | null; name: string | null; views: number; whatsappClicks: number; shares: number }
export interface MetricsExportFormatRow { format: string; completed: number; failed: number }

export interface Metrics {
  period: { days: MetricsPeriod; from: string; to: string; timezone: string };
  storeId: string | null;
  stores: Array<{ id: string; name: string; slug: string }>;
  totals: EventCounts;
  series: MetricsDay[];
  byOrigin: MetricsOriginRow[];
  byCampaign: MetricsCampaignRow[];
  campaigns: { created: number; published: number; ended: number };
  exports: { completed: number; failed: number; packages: number; byFormat: MetricsExportFormatRow[] };
}

const querySchema = z.object({
  periodo: z.enum(["7", "30", "90"], { message: "Escolha um período de 7, 30 ou 90 dias." }).default("30"),
  loja: z.string().trim().min(1).max(64).optional(),
});

/** Data (YYYY-MM-DD) do instante no fuso de São Paulo. */
export function dayInTz(d: Date, tz = METRICS_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const toInt = (v: unknown) => Number(v ?? 0) || 0;
const KIND_KEY = { view: "views", whatsapp_click: "whatsappClicks", share: "shares" } as const;

type Row = Record<string, unknown>;
async function rows(q: SQL): Promise<Row[]> {
  const r = await getDb().execute(q);
  return (r as unknown as { rows: Row[] }).rows;
}

/**
 * Métricas do período (últimos N dias, incluindo hoje) para a conta do ctx.
 * `rawQuery`: { periodo: "7"|"30"|"90", loja?: storeId }.
 */
export async function getMetrics(ctx: TenantCtx, rawQuery: unknown, now: Date = new Date()): Promise<Metrics> {
  requirePermission(ctx, "campaigns.read");
  const q = querySchema.parse(rawQuery ?? {});
  const days = Number(q.periodo) as MetricsPeriod;
  const db = getDb();

  // lojas visíveis para este membro (para o seletor e para o filtro)
  const storeWhere = [eq(schema.stores.orgId, ctx.orgId), isNull(schema.stores.deletedAt)];
  if (ctx.storeIds !== null) storeWhere.push(ctx.storeIds.length ? inArray(schema.stores.id, ctx.storeIds) : eq(schema.stores.id, "__nenhuma__"));
  const stores = await db.select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug })
    .from(schema.stores).where(and(...storeWhere)).orderBy(asc(schema.stores.name));

  let storeId: string | null = null;
  if (q.loja) { await getAccessibleStore(ctx, q.loja); storeId = q.loja; }

  /** filtro de loja para uma coluna store_id (SQL bruto) */
  const storeCond = (col: SQL): SQL => {
    if (storeId) return sql`${col} = ${storeId}`;
    if (ctx.storeIds === null) return sql`true`;
    if (!ctx.storeIds.length) return sql`false`;
    return sql`${col} in (${sql.join(ctx.storeIds.map((s) => sql`${s}`), sql`, `)})`;
  };

  const to = dayInTz(now);
  const from = addDays(to, -(days - 1));
  const start = sql`((${from}::date)::timestamp at time zone ${METRICS_TZ})`;
  const end = sql`${now.toISOString()}::timestamptz`;
  const inRange = (col: SQL) => sql`${col} >= ${start} and ${col} <= ${end}`;

  const evWhere = sql`e.org_id = ${ctx.orgId} and ${inRange(sql`e.created_at`)} and ${storeCond(sql`e.store_id`)}`;

  const [daily, origins, perCampaign, campCreated, campFlow, expStatus, expFormats] = await Promise.all([
    rows(sql`select to_char(e.created_at at time zone ${METRICS_TZ}, 'YYYY-MM-DD') as day, e.kind, coalesce(e.source = 'qr', false) as qr, count(*)::int as n
      from storefront_events e where ${evWhere} group by 1, 2, 3`),
    rows(sql`select e.source, e.kind, count(*)::int as n from storefront_events e where ${evWhere} and e.kind in ('view','whatsapp_click','share') group by 1, 2`),
    rows(sql`select e.campaign_id, c.name, e.kind, count(*)::int as n
      from storefront_events e left join campaigns c on c.id = e.campaign_id and c.org_id = e.org_id
      where ${evWhere} and e.kind in ('view','whatsapp_click','share') group by 1, 2, 3`),
    rows(sql`select count(*)::int as n from campaigns c
      where c.org_id = ${ctx.orgId} and c.deleted_at is null and ${inRange(sql`c.created_at`)} and ${storeCond(sql`c.store_id`)}`),
    // publicações e encerramentos (manuais ou automáticos) ficam no registro de auditoria
    rows(sql`select a.action, count(distinct a.entity_id)::int as n from audit_log a
      join campaigns c on c.id = a.entity_id and c.org_id = a.org_id
      where a.org_id = ${ctx.orgId} and a.entity_type = 'campaign' and a.action in ('campaign.publish', 'campaign.end')
        and c.deleted_at is null and ${inRange(sql`a.created_at`)} and ${storeCond(sql`c.store_id`)}
      group by 1`),
    rows(sql`select j.status, coalesce(j.request->>'kind', 'single') as kind, count(*)::int as n from export_jobs j
      join campaigns c on c.id = j.campaign_id and c.org_id = j.org_id
      where j.org_id = ${ctx.orgId} and j.status in ('concluida', 'falhou')
        and ${inRange(sql`coalesce(j.finished_at, j.created_at)`)} and ${storeCond(sql`c.store_id`)}
      group by 1, 2`),
    rows(sql`select it->>'format' as format, j.status, count(distinct j.id)::int as n from export_jobs j
      join campaigns c on c.id = j.campaign_id and c.org_id = j.org_id
      cross join lateral jsonb_array_elements(case when jsonb_typeof(j.request->'items') = 'array' then j.request->'items' else '[]'::jsonb end) it
      where j.org_id = ${ctx.orgId} and j.status in ('concluida', 'falhou')
        and ${inRange(sql`coalesce(j.finished_at, j.created_at)`)} and ${storeCond(sql`c.store_id`)}
      group by 1, 2`),
  ]);

  // série diária (todos os dias do período, inclusive os sem eventos)
  const byDay = new Map<string, MetricsDay>();
  for (let i = 0; i < days; i++) { const d = addDays(from, i); byDay.set(d, { date: d, views: 0, whatsappClicks: 0, shares: 0, qrAccesses: 0 }); }
  const totals: EventCounts = { views: 0, whatsappClicks: 0, shares: 0, qrAccesses: 0 };
  for (const r of daily) {
    const day = byDay.get(String(r.day));
    const n = toInt(r.n);
    const kind = String(r.kind);
    const targets = day ? [day, totals] : [totals];
    for (const t of targets) {
      if (kind in KIND_KEY) t[KIND_KEY[kind as keyof typeof KIND_KEY]] += n;
      // acesso por QR: visualização com origem "qr" ou evento qr_scan
      if (kind === "qr_scan" || (kind === "view" && r.qr === true)) t.qrAccesses += n;
    }
  }

  const originMap = new Map<string, MetricsOriginRow>();
  for (const r of origins) {
    const source = (r.source as string | null) ?? null;
    const key = source ?? "";
    const row = originMap.get(key) ?? { source, views: 0, whatsappClicks: 0, shares: 0 };
    row[KIND_KEY[String(r.kind) as keyof typeof KIND_KEY]] += toInt(r.n);
    originMap.set(key, row);
  }
  const campMap = new Map<string, MetricsCampaignRow>();
  for (const r of perCampaign) {
    const campaignId = (r.campaign_id as string | null) ?? null;
    const key = campaignId ?? "";
    const row = campMap.get(key) ?? { campaignId, name: (r.name as string | null) ?? null, views: 0, whatsappClicks: 0, shares: 0 };
    row[KIND_KEY[String(r.kind) as keyof typeof KIND_KEY]] += toInt(r.n);
    campMap.set(key, row);
  }
  const rank = <T extends { views: number; whatsappClicks: number; shares: number }>(a: T, b: T) =>
    b.views - a.views || b.whatsappClicks - a.whatsappClicks || b.shares - a.shares;

  const flow = (action: string) => toInt(campFlow.find((r) => r.action === action)?.n);
  const expCount = (status: string) => expStatus.filter((r) => r.status === status).reduce((n, r) => n + toInt(r.n), 0);
  const fmtMap = new Map<string, MetricsExportFormatRow>();
  for (const r of expFormats) {
    const format = String(r.format ?? "");
    if (!format) continue;
    const row = fmtMap.get(format) ?? { format, completed: 0, failed: 0 };
    if (r.status === "concluida") row.completed += toInt(r.n); else row.failed += toInt(r.n);
    fmtMap.set(format, row);
  }

  return {
    period: { days, from, to, timezone: METRICS_TZ },
    storeId,
    stores,
    totals,
    series: [...byDay.values()],
    byOrigin: [...originMap.values()].sort(rank),
    byCampaign: [...campMap.values()].sort(rank),
    campaigns: { created: toInt(campCreated[0]?.n), published: flow("campaign.publish"), ended: flow("campaign.end") },
    exports: {
      completed: expCount("concluida"),
      failed: expCount("falhou"),
      packages: expStatus.filter((r) => r.status === "concluida" && r.kind === "package").reduce((n, r) => n + toInt(r.n), 0),
      byFormat: [...fmtMap.values()].sort((a, b) => b.completed + b.failed - (a.completed + a.failed)),
    },
  };
}
