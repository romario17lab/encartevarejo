import { and, desc, eq, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { getAccessibleStore, requirePermission } from "../tenant";

/**
 * Histórico da conta (registro de auditoria) com filtros por tipo e por loja.
 * - Somente papéis com "audit.read" (administrador e aprovador).
 * - Membro limitado a filiais só vê o que é das lojas dele (dados de lojas, preços por loja e campanhas dessas lojas).
 */
export const HISTORY_TYPES = {
  campanhas: { label: "Campanhas", prefixes: ["campaign."] },
  produtos: { label: "Produtos e preços", prefixes: ["product.", "store_price."] },
  lojas: { label: "Lojas e identidade visual", prefixes: ["store.", "brand."] },
  equipe: { label: "Equipe e convites", prefixes: ["member."] },
  exportacoes: { label: "Exportações", prefixes: ["export."] },
  conta: { label: "Conta e plano", prefixes: ["org.", "billing.", "subscription.", "plan."] },
  acessos: { label: "Acessos", prefixes: ["auth."] },
} as const;
export type HistoryType = keyof typeof HISTORY_TYPES;

export interface HistoryQuery {
  type?: string | null;
  storeId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  cursor?: string | null;
  limit?: number;
}

export async function listHistory(ctx: TenantCtx, q: HistoryQuery) {
  requirePermission(ctx, "audit.read");
  const db = getDb();
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const a = schema.auditLog;
  const camp = alias(schema.campaigns, "hist_campaign");
  const store = alias(schema.stores, "hist_store");
  // loja a que a entrada se refere: a própria loja (lojas e preços por loja) ou a loja da campanha
  const storeOf = sql<string | null>`coalesce(case when ${a.entityType} = 'store' then ${a.entityId} end, ${camp.storeId})`;

  const conds: (SQL | undefined)[] = [eq(a.orgId, ctx.orgId)];
  if (q.type) {
    const t = HISTORY_TYPES[q.type as HistoryType];
    if (!t) throw new AppError("validation", "Tipo de histórico inválido.");
    conds.push(or(...t.prefixes.map((p) => like(a.action, `${p}%`))));
  }
  if (q.entityType) conds.push(eq(a.entityType, q.entityType));
  if (q.entityId) conds.push(eq(a.entityId, q.entityId));
  if (q.storeId) {
    await getAccessibleStore(ctx, q.storeId, db);
    conds.push(sql`${storeOf} = ${q.storeId}`);
  }
  if (ctx.storeIds !== null) {
    conds.push(ctx.storeIds.length ? inArray(storeOf, ctx.storeIds) : sql`false`);
  }
  if (q.cursor) {
    if (!/^\d+$/.test(q.cursor)) throw new AppError("validation", "Cursor inválido.");
    conds.push(lt(a.id, Number(q.cursor)));
  }
  const rows = await db.select({
    id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, summary: a.summary, data: a.data, createdAt: a.createdAt,
    userId: a.userId, userName: schema.users.name, storeId: storeOf, storeName: store.name,
  }).from(a)
    .leftJoin(schema.users, eq(schema.users.id, a.userId))
    .leftJoin(camp, and(eq(a.entityType, "campaign"), eq(camp.id, a.entityId), eq(camp.orgId, ctx.orgId)))
    .leftJoin(store, and(eq(store.orgId, ctx.orgId), sql`${store.id} = ${storeOf}`))
    .where(and(...conds)).orderBy(desc(a.id)).limit(limit + 1);
  const page = rows.slice(0, limit).map((r) => ({ ...r, orgId: ctx.orgId }));
  return { entries: page, nextCursor: rows.length > limit ? String(page[page.length - 1]!.id) : null };
}
