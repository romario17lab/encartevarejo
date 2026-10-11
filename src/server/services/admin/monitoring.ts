// Acompanhamento da plataforma: falhas de exportação, consumo por conta e eventos de cobrança.
import { and, count, desc, eq, gte, inArray, isNull, lt, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db";
import { AppError, notFound } from "../../errors";
import { scrubSensitive, writeAdminAudit } from "./audit";
import { monthStart } from "./accounts";

// ---------------- Exportações com falha ----------------
const exportsSchema = z.object({
  orgId: z.string().max(60).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function listFailedExports(raw: Record<string, unknown>) {
  const q = exportsSchema.parse(raw);
  const db = getDb();
  const since = new Date(Date.now() - q.days * 86_400_000);
  const conds: SQL[] = [eq(schema.exportJobs.status, "falhou"), gte(schema.exportJobs.createdAt, since)];
  if (q.orgId) conds.push(eq(schema.exportJobs.orgId, q.orgId));
  const rows = await db.select({
    id: schema.exportJobs.id, orgId: schema.exportJobs.orgId, orgName: schema.organizations.name,
    campaignId: schema.exportJobs.campaignId, campaignName: schema.campaigns.name, campaignVersion: schema.exportJobs.campaignVersion,
    request: schema.exportJobs.request, attempts: schema.exportJobs.attempts, error: schema.exportJobs.error,
    createdAt: schema.exportJobs.createdAt, finishedAt: schema.exportJobs.finishedAt,
  }).from(schema.exportJobs)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.exportJobs.orgId))
    .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.exportJobs.campaignId))
    .where(and(...conds)).orderBy(desc(schema.exportJobs.createdAt)).limit(q.limit);
  const statusConds: SQL[] = [gte(schema.exportJobs.createdAt, since)];
  if (q.orgId) statusConds.push(eq(schema.exportJobs.orgId, q.orgId));
  const byStatus = await db.select({ status: schema.exportJobs.status, n: count() }).from(schema.exportJobs).where(and(...statusConds)).groupBy(schema.exportJobs.status);
  const totals = Object.fromEntries(byStatus.map((s) => [s.status, s.n])) as Record<string, number>;
  const all = byStatus.reduce((n, s) => n + s.n, 0);
  return {
    jobs: rows.map((r) => ({ ...r, formats: r.request.items.map((i) => `${i.format} (${i.fileType.toUpperCase()})`), kind: r.request.kind })),
    totals: { total: all, failed: totals.falhou ?? 0, done: totals.concluida ?? 0, pending: (totals.na_fila ?? 0) + (totals.processando ?? 0) },
    days: q.days,
    retryAvailable: true,
  };
}

/**
 * Reenvia uma exportação que falhou: volta para "na_fila" com o MESMO pedido e a MESMA versão da campanha
 * (o arquivo gerado continua fiel ao que o cliente pediu) e entra na fila do worker.
 */
export async function retryExport(adminUserId: string, jobId: string) {
  const db = getDb();
  const [job] = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, jobId));
  if (!job) throw notFound("Exportação");
  if (job.status !== "falhou") throw new AppError("conflict", "Só é possível reenviar exportações com falha.");
  await db.update(schema.exportJobs).set({ status: "na_fila", error: null, finishedAt: null, startedAt: null })
    .where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.status, "falhou")));
  await writeAdminAudit(db, {
    adminUserId, action: "export.retry", targetType: "export_job", targetId: job.id,
    details: { orgId: job.orgId, campaignId: job.campaignId, campaignVersion: job.campaignVersion, previousError: job.error, attempts: job.attempts },
  });
  let queued = true;
  if (process.env.EXPORT_INLINE === "1") {
    const { runExportJob } = await import("@/server/export/run");
    await runExportJob(job.id, { finalAttempt: true });
  } else {
    try {
      const { enqueueExport } = await import("@/worker/queue");
      await enqueueExport(job.id);
    } catch (e) {
      queued = false;
      console.error("[admin] falha ao reenfileirar exportação:", (e as Error).message);
      await db.update(schema.exportJobs).set({ status: "falhou", error: "Não foi possível colocar a exportação na fila. Tente novamente.", finishedAt: new Date() })
        .where(eq(schema.exportJobs.id, job.id));
    }
  }
  const [after] = await db.select({ status: schema.exportJobs.status, error: schema.exportJobs.error }).from(schema.exportJobs).where(eq(schema.exportJobs.id, job.id));
  return { id: job.id, queued, status: after?.status ?? "na_fila", error: after?.error ?? null };
}

// ---------------- Consumo ----------------
const usageSchema = z.object({
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["storage", "exports", "ai", "video", "name"]).default("storage"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function usageOverview(raw: Record<string, unknown>, now = new Date()) {
  const q = usageSchema.parse(raw);
  const db = getDb();
  const from = monthStart(now);
  const orgConds: SQL[] = [isNull(schema.organizations.deletedAt)];
  if (q.q) orgConds.push(sql`${schema.organizations.name} ilike ${`%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`}`);
  const orgs = await db.select({
    id: schema.organizations.id, name: schema.organizations.name, planId: schema.organizations.planId, planName: schema.plans.name,
    limits: schema.plans.limits, suspendedAt: schema.organizations.suspendedAt, isDemo: schema.organizations.isDemo,
  }).from(schema.organizations).innerJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId)).where(and(...orgConds));
  const ids = orgs.map((o) => o.id);
  const [storage, exportsM, usage] = ids.length ? await Promise.all([
    db.select({ orgId: schema.assets.orgId, bytes: sum(schema.assets.bytes) }).from(schema.assets).where(inArray(schema.assets.orgId, ids)).groupBy(schema.assets.orgId),
    db.select({ orgId: schema.exportJobs.orgId, n: count() }).from(schema.exportJobs)
      .where(and(inArray(schema.exportJobs.orgId, ids), gte(schema.exportJobs.createdAt, from))).groupBy(schema.exportJobs.orgId),
    db.select({ orgId: schema.usageEvents.orgId, kind: schema.usageEvents.kind, q: sum(schema.usageEvents.quantity) }).from(schema.usageEvents)
      .where(and(inArray(schema.usageEvents.orgId, ids), gte(schema.usageEvents.createdAt, from)))
      .groupBy(schema.usageEvents.orgId, schema.usageEvents.kind),
  ]) : [[], [], []];
  const st = new Map(storage.map((r) => [r.orgId, Number(r.bytes ?? 0)]));
  const ex = new Map(exportsM.map((r) => [r.orgId, r.n]));
  const us = new Map(usage.map((r) => [`${r.orgId}|${r.kind}`, Number(r.q ?? 0)]));
  const pct = (used: number, limit: number) => (limit > 0 ? Math.round((used / limit) * 1000) / 10 : used > 0 ? null : 0);
  const rows = orgs.map((o) => {
    const storageBytes = st.get(o.id) ?? 0;
    const exports = ex.get(o.id) ?? 0;
    const ai = us.get(`${o.id}|ai_credit`) ?? 0;
    const video = us.get(`${o.id}|video_second`) ?? 0;
    return {
      orgId: o.id, orgName: o.name, planId: o.planId, planName: o.planName, suspended: !!o.suspendedAt, isDemo: o.isDemo,
      storageBytes, storageLimitMb: o.limits.storageMb, storagePct: pct(storageBytes / 1048576, o.limits.storageMb),
      exportsThisMonth: exports, exportsLimit: o.limits.exportsPerMonth, exportsPct: pct(exports, o.limits.exportsPerMonth),
      aiCredits: ai, aiLimit: o.limits.aiCreditsPerMonth, aiPct: pct(ai, o.limits.aiCreditsPerMonth),
      videoSeconds: video, videoLimitSeconds: o.limits.videoMinutesPerMonth * 60, videoPct: pct(video, o.limits.videoMinutesPerMonth * 60),
    };
  });
  const key = { storage: "storageBytes", exports: "exportsThisMonth", ai: "aiCredits", video: "videoSeconds" } as const;
  rows.sort((a, b) => (q.sort === "name" ? a.orgName.localeCompare(b.orgName, "pt-BR") : b[key[q.sort]] - a[key[q.sort]]));
  const totals = rows.reduce((t, r) => ({
    storageBytes: t.storageBytes + r.storageBytes, exportsThisMonth: t.exportsThisMonth + r.exportsThisMonth,
    aiCredits: t.aiCredits + r.aiCredits, videoSeconds: t.videoSeconds + r.videoSeconds,
    overLimit: t.overLimit + ([r.storagePct, r.exportsPct, r.aiPct, r.videoPct].some((p) => p == null || p >= 100) ? 1 : 0),
  }), { storageBytes: 0, exportsThisMonth: 0, aiCredits: 0, videoSeconds: 0, overLimit: 0 });
  return { rows: rows.slice(0, q.limit), totalOrgs: rows.length, totals, monthStart: from };
}

// ---------------- Eventos de cobrança ----------------
const billingSchema = z.object({
  provider: z.string().max(30).optional(),
  type: z.string().max(80).optional(),
  status: z.enum(["processado", "ignorado", "falhou"]).optional(),
  orgId: z.string().max(60).optional(),
  testMode: z.enum(["1", "0"]).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Dados pessoais/sensíveis nunca saem nesta tela (além do filtro de segredos). */
const BILLING_PERSONAL = /email|phone|telefone|address|endereco|^(name|full_?name|customer_?name|nome)$|tax|last4|fingerprint|customer_details|billing_details|payment_method/i;
function scrubBilling(v: unknown, depth = 0): unknown {
  const base = scrubSensitive(v);
  const walk = (x: unknown, d: number): unknown => {
    if (d > 6) return null;
    if (Array.isArray(x)) return x.map((y) => walk(y, d + 1));
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !BILLING_PERSONAL.test(k)).map(([k, y]) => [k, walk(y, d + 1)]));
    return x;
  };
  return walk(base, depth);
}

export async function listBillingEvents(raw: Record<string, unknown>) {
  const q = billingSchema.parse(raw);
  const db = getDb();
  const conds: SQL[] = [];
  if (q.provider) conds.push(eq(schema.billingEvents.provider, q.provider));
  if (q.type) conds.push(eq(schema.billingEvents.type, q.type));
  if (q.status) conds.push(eq(schema.billingEvents.status, q.status));
  if (q.orgId) conds.push(eq(schema.billingEvents.orgId, q.orgId));
  if (q.testMode) conds.push(eq(schema.billingEvents.testMode, q.testMode === "1"));
  if (q.before) conds.push(lt(schema.billingEvents.createdAt, new Date(q.before)));
  const rows = await db.select({
    id: schema.billingEvents.id, orgId: schema.billingEvents.orgId, orgName: schema.organizations.name,
    provider: schema.billingEvents.provider, type: schema.billingEvents.type, testMode: schema.billingEvents.testMode,
    status: schema.billingEvents.status, error: schema.billingEvents.error, summary: schema.billingEvents.summary, createdAt: schema.billingEvents.createdAt,
  }).from(schema.billingEvents).leftJoin(schema.organizations, eq(schema.organizations.id, schema.billingEvents.orgId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.billingEvents.createdAt), desc(schema.billingEvents.id)).limit(q.limit + 1);
  const more = rows.length > q.limit;
  const items = rows.slice(0, q.limit).map((r) => ({ ...r, summary: scrubBilling(r.summary), error: r.error ? r.error.slice(0, 300) : null }));
  const [providers, types] = await Promise.all([
    db.selectDistinct({ v: schema.billingEvents.provider }).from(schema.billingEvents),
    db.selectDistinct({ v: schema.billingEvents.type }).from(schema.billingEvents),
  ]);
  return {
    events: items,
    nextBefore: more ? items[items.length - 1]!.createdAt.toISOString() : null,
    providers: providers.map((p) => p.v).sort(), types: types.map((t) => t.v).sort(),
  };
}

// ---------------- Visão geral ----------------
export async function adminOverview(now = new Date()) {
  const db = getDb();
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [[orgs], [suspended], [failed7], [exports7], [billingFailed7], subs, [storage]] = await Promise.all([
    db.select({ n: count() }).from(schema.organizations).where(isNull(schema.organizations.deletedAt)),
    db.select({ n: count() }).from(schema.organizations).where(and(isNull(schema.organizations.deletedAt), sql`${schema.organizations.suspendedAt} is not null`)),
    db.select({ n: count() }).from(schema.exportJobs).where(and(eq(schema.exportJobs.status, "falhou"), gte(schema.exportJobs.createdAt, week))),
    db.select({ n: count() }).from(schema.exportJobs).where(gte(schema.exportJobs.createdAt, week)),
    db.select({ n: count() }).from(schema.billingEvents).where(and(eq(schema.billingEvents.status, "falhou"), gte(schema.billingEvents.createdAt, week))),
    db.select({ status: schema.subscriptions.status, n: count() }).from(schema.subscriptions).groupBy(schema.subscriptions.status),
    db.select({ bytes: sum(schema.assets.bytes) }).from(schema.assets),
  ]);
  return {
    orgs: orgs?.n ?? 0, suspended: suspended?.n ?? 0,
    exportsLast7Days: exports7?.n ?? 0, failedExportsLast7Days: failed7?.n ?? 0,
    billingFailuresLast7Days: billingFailed7?.n ?? 0,
    subscriptions: Object.fromEntries(subs.map((s) => [s.status, s.n])) as Record<string, number>,
    storageBytes: Number(storage?.bytes ?? 0),
  };
}
