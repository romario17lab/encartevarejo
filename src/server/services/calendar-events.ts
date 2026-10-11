import { z } from "zod";
import { and, eq, isNull, like, or, gte, lte, sql } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { writeAudit } from "../audit";
import { newId } from "../ids";
import { requirePermission } from "../tenant";
import { commercialCalendar } from "../calendar";
import { can } from "@/domain/campaign";
import { listCampaigns } from "./campaigns";

// Calendário de campanhas: datas comerciais globais (geradas por ano, com datas móveis calculadas),
// eventos editáveis da conta e campanhas da conta no período.

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
/** Intervalo máximo de uma consulta (dias): evita gerar/ler anos demais de uma vez. */
const MAX_RANGE_DAYS = 800;

/** true quando a string é YYYY-MM-DD e a data existe (ex.: rejeita 2026-02-30). */
export function isValidYmd(v: string): boolean {
  if (!YMD.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const dateField = z.string().trim()
  .refine(isValidYmd, "Data inválida. Use o formato AAAA-MM-DD com uma data que exista.")
  .refine((v) => { const y = Number(v.slice(0, 4)); return y >= MIN_YEAR && y <= MAX_YEAR; }, `Use um ano entre ${MIN_YEAR} e ${MAX_YEAR}.`);

const nameField = z.string().trim().min(1, "Informe o nome do evento.").max(80, "O nome pode ter no máximo 80 caracteres.");
const noteField = z.string().trim().max(200, "A observação pode ter no máximo 200 caracteres.").nullable().optional()
  .transform((v) => (v === undefined ? undefined : v || null)); // "" vira null; ausente continua ausente

export const calendarEventInput = z.object({ name: nameField, date: dateField, note: noteField });
export const calendarEventPatch = z.object({ name: nameField.optional(), date: dateField.optional(), note: noteField })
  .refine((v) => v.name !== undefined || v.date !== undefined || v.note !== undefined, "Nada para alterar.");

const GLOBAL_READONLY = "Esta é uma data comercial do calendário padrão e não pode ser alterada. Crie um evento da sua conta para ajustar.";

export type CalendarScope = "global" | "conta";
export interface CalendarEventDTO {
  id: string; name: string; date: string; isMovable: boolean; note: string | null; scope: CalendarScope; editable: boolean;
}

function toDTO(ctx: TenantCtx, r: typeof schema.calendarEvents.$inferSelect): CalendarEventDTO {
  const scope: CalendarScope = r.orgId ? "conta" : "global";
  return { id: r.id, name: r.name, date: r.date, isMovable: r.isMovable, note: r.note, scope, editable: scope === "conta" && can(ctx.role, "campaigns.write") };
}

// ---------------- Datas comerciais globais por ano ----------------

/**
 * Garante que as datas comerciais globais de cada ano existam e estejam corretas
 * (datas móveis recalculadas pelo algoritmo da Páscoa). Idempotente e seguro com
 * requisições simultâneas (trava consultiva por ano). Não apaga eventos extras.
 * Devolve quantos registros foram criados/corrigidos.
 */
export async function ensureGlobalCalendar(years: number[]): Promise<{ inserted: number; fixed: number }> {
  const db = getDb();
  let inserted = 0, fixed = 0;
  const uniq = [...new Set(years)].filter((y) => Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR).sort();
  for (const year of uniq) {
    const expected = commercialCalendar(year);
    const forYear = and(isNull(schema.calendarEvents.orgId), like(schema.calendarEvents.date, `${year}-%`));
    const isOk = (rows: Array<typeof schema.calendarEvents.$inferSelect>) => {
      const byName = new Map<string, typeof rows>();
      for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
      return expected.every((e) => { const list = byName.get(e.name); return list?.length === 1 && list[0].date === e.date && list[0].isMovable === e.isMovable; });
    };
    // caminho rápido (sem transação) quando o ano já está completo e correto
    if (isOk(await db.select().from(schema.calendarEvents).where(forYear))) continue;

    const r = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ev_calendar_global'), ${year})`);
      const rows = await tx.select().from(schema.calendarEvents).where(forYear);
      let ins = 0, fix = 0;
      for (const e of expected) {
        const same = rows.filter((x) => x.name === e.name);
        if (same.length === 0) {
          await tx.insert(schema.calendarEvents).values({ id: newId("cal"), orgId: null, name: e.name, date: e.date, isMovable: e.isMovable, note: e.note });
          ins++;
          continue;
        }
        const [keep, ...dupes] = same;
        for (const d of dupes) { await tx.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, d.id)); fix++; }
        if (keep.date !== e.date || keep.isMovable !== e.isMovable) {
          await tx.update(schema.calendarEvents).set({ date: e.date, isMovable: e.isMovable, note: e.note }).where(eq(schema.calendarEvents.id, keep.id));
          fix++;
        }
      }
      return { ins, fix };
    });
    inserted += r.ins; fixed += r.fix;
  }
  return { inserted, fixed };
}

// ---------------- Leitura ----------------

const pad = (n: number) => String(n).padStart(2, "0");
/** Data de hoje em São Paulo (YYYY-MM-DD). */
function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Normaliza o intervalo pedido. Sem datas: mês atual (São Paulo). */
export function resolveRange(from?: string | null, to?: string | null): { from: string; to: string } {
  if (from && !isValidYmd(from)) throw new AppError("validation", "Data inicial inválida (use AAAA-MM-DD).");
  if (to && !isValidYmd(to)) throw new AppError("validation", "Data final inválida (use AAAA-MM-DD).");
  const today = todaySP();
  const [y, m] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const f = from ?? (to ? to.slice(0, 8) + "01" : `${y}-${pad(m)}-01`);
  const t = to ?? (from ? (() => { const [fy, fm] = f.split("-").map(Number); return `${fy}-${pad(fm)}-${pad(new Date(Date.UTC(fy, fm, 0)).getUTCDate())}`; })() : `${y}-${pad(m)}-${pad(lastDay)}`);
  if (t < f) throw new AppError("validation", "A data final precisa ser igual ou posterior à inicial.");
  const span = (Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000;
  if (span > MAX_RANGE_DAYS) throw new AppError("validation", "Período longo demais. Consulte no máximo dois anos por vez.");
  const fy = Number(f.slice(0, 4)), ty = Number(t.slice(0, 4));
  if (fy < MIN_YEAR || ty > MAX_YEAR) throw new AppError("validation", `O calendário cobre os anos de ${MIN_YEAR} a ${MAX_YEAR}.`);
  return { from: f, to: t };
}

/** Datas comerciais (globais + da conta) no intervalo. Garante as globais de cada ano do intervalo. */
export async function listCalendarEvents(ctx: TenantCtx, from?: string | null, to?: string | null): Promise<CalendarEventDTO[]> {
  const range = resolveRange(from, to);
  const years: number[] = [];
  for (let y = Number(range.from.slice(0, 4)); y <= Number(range.to.slice(0, 4)); y++) years.push(y);
  await ensureGlobalCalendar(years);
  const rows = await getDb().select().from(schema.calendarEvents)
    .where(and(
      or(isNull(schema.calendarEvents.orgId), eq(schema.calendarEvents.orgId, ctx.orgId)),
      gte(schema.calendarEvents.date, range.from), lte(schema.calendarEvents.date, range.to),
    ))
    .orderBy(schema.calendarEvents.date, schema.calendarEvents.name);
  return rows.map((r) => toDTO(ctx, r));
}

/** Compatibilidade: assinatura antiga de org.ts (só eventos). */
export const listCalendar = listCalendarEvents;

export interface CalendarCampaignDTO {
  id: string; name: string; status: string; startsAt: string | null; endsAt: string | null; storeId: string; storeName: string | null;
}

/** Calendário completo do período: datas comerciais + campanhas da conta que se sobrepõem a ele. */
export async function getCalendar(ctx: TenantCtx, from?: string | null, to?: string | null) {
  requirePermission(ctx, "campaigns.read");
  const range = resolveRange(from, to);
  const events = await listCalendarEvents(ctx, range.from, range.to);
  // limites do dia no horário de Brasília (igual às datas de campanha)
  const list = await listCampaigns(ctx, { from: `${range.from}T00:00:00-03:00`, to: `${range.to}T23:59:59.999-03:00`, limit: 500 });
  const campaigns: CalendarCampaignDTO[] = list
    .filter((c) => c.startsAt || c.endsAt)
    .map((c) => ({
      id: c.id, name: c.name, status: c.status, storeId: c.storeId, storeName: c.storeName ?? null,
      startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null,
      endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null,
    }))
    .sort((a, b) => (a.startsAt ?? a.endsAt ?? "").localeCompare(b.startsAt ?? b.endsAt ?? ""));
  return { range, events, campaigns, canEdit: can(ctx.role, "campaigns.write") };
}

// ---------------- Escrita (apenas eventos da conta) ----------------

async function loadEditable(ctx: TenantCtx, id: string, db: Executor) {
  const [row] = await db.select().from(schema.calendarEvents)
    .where(and(eq(schema.calendarEvents.id, id), or(isNull(schema.calendarEvents.orgId), eq(schema.calendarEvents.orgId, ctx.orgId))));
  if (!row) throw notFound("Evento");
  if (row.orgId === null) throw new AppError("forbidden", GLOBAL_READONLY);
  return row;
}

export async function createCalendarEvent(ctx: TenantCtx, raw: unknown): Promise<CalendarEventDTO> {
  requirePermission(ctx, "campaigns.write");
  const input = calendarEventInput.parse(raw);
  const db = getDb();
  const id = newId("cal");
  const row = await db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.calendarEvents).values({ id, orgId: ctx.orgId, name: input.name, date: input.date, isMovable: false, note: input.note ?? null }).returning();
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "calendar.create", entityType: "calendar_event", entityId: id, summary: `Evento "${input.name}" adicionado ao calendário em ${input.date}.`, data: { name: input.name, date: input.date } });
    return r;
  });
  return toDTO(ctx, row);
}

export async function updateCalendarEvent(ctx: TenantCtx, id: string, raw: unknown): Promise<CalendarEventDTO> {
  requirePermission(ctx, "campaigns.write");
  const db = getDb();
  await loadEditable(ctx, id, db); // 404 / somente leitura antes de validar o corpo
  const input = calendarEventPatch.parse(raw);
  const row = await db.transaction(async (tx) => {
    const cur = await loadEditable(ctx, id, tx);
    const next = { name: input.name ?? cur.name, date: input.date ?? cur.date, note: input.note !== undefined ? input.note : cur.note };
    const [r] = await tx.update(schema.calendarEvents).set(next)
      .where(and(eq(schema.calendarEvents.id, id), eq(schema.calendarEvents.orgId, ctx.orgId))).returning();
    const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => next[k] !== cur[k]);
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "calendar.update", entityType: "calendar_event", entityId: id, summary: `Evento "${next.name}" do calendário atualizado.`, data: { changed, from: { name: cur.name, date: cur.date }, to: { name: next.name, date: next.date } } });
    return r;
  });
  return toDTO(ctx, row);
}

export async function deleteCalendarEvent(ctx: TenantCtx, id: string): Promise<{ ok: true }> {
  requirePermission(ctx, "campaigns.write");
  await getDb().transaction(async (tx) => {
    const cur = await loadEditable(ctx, id, tx);
    await tx.delete(schema.calendarEvents).where(and(eq(schema.calendarEvents.id, id), eq(schema.calendarEvents.orgId, ctx.orgId)));
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "calendar.delete", entityType: "calendar_event", entityId: id, summary: `Evento "${cur.name}" (${cur.date}) removido do calendário.`, data: { name: cur.name, date: cur.date } });
  });
  return { ok: true };
}
