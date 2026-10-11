import "../zod-pt";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or } from "drizzle-orm";
import { unitSchema } from "@/domain/offer";
import { normalizeName } from "../text";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { writeAudit } from "../audit";
import { randomToken, sha256 } from "../signing";
import { requirePermission } from "../tenant";

// Tokens de API por conta (integrações com sistemas de gestão).
// Formato: evk_<prefixo de 8>_<segredo>. Guardamos só o prefixo (para identificar na tela) e o sha256 do token inteiro.
// O token completo aparece uma única vez, na criação. Somente administradores criam, listam e revogam.

export const API_SCOPES = ["products.read", "products.write", "prices.write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const API_SCOPE_LABEL: Record<ApiScope, string> = {
  "products.read": "Ler produtos e preços",
  "products.write": "Cadastrar produtos novos (com dados completos)",
  "prices.write": "Atualizar preços normal e promocional",
};
const MAX_ACTIVE_TOKENS = 20;
const prefixGen = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);
const tokId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);

export const createTokenSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao token (ex.: ERP da loja).").max(60),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Escolha pelo menos uma permissão.").max(API_SCOPES.length)
    .transform((s) => [...new Set(s)].sort()),
});

function present(t: typeof schema.apiTokens.$inferSelect, createdByName?: string | null) {
  return {
    id: t.id, name: t.name, prefix: t.prefix, scopes: t.scopes, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt, revokedAt: t.revokedAt,
    createdByName: createdByName ?? null, status: t.revokedAt ? "revogado" : "ativo",
  };
}

export async function createApiToken(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "org.manage");
  const input = createTokenSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    const [{ n }] = await tx.select({ n: count() }).from(schema.apiTokens).where(and(eq(schema.apiTokens.orgId, ctx.orgId), isNull(schema.apiTokens.revokedAt))) as [{ n: number }];
    if (n >= MAX_ACTIVE_TOKENS) throw new AppError("limit_reached", `A conta já tem ${n} tokens ativos. Revogue os que não usa mais.`);
    const prefix = `evk_${prefixGen()}`;
    const token = `${prefix}_${randomToken(32)}`;
    const [row] = await tx.insert(schema.apiTokens).values({
      id: `tok_${tokId()}`, orgId: ctx.orgId, name: input.name, prefix, tokenHash: sha256(token), scopes: input.scopes, createdBy: ctx.userId,
    }).returning();
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "integration.token_create", entityType: "api_token", entityId: row!.id,
      summary: `Token de API "${input.name}" criado (${input.scopes.join(", ")}).`, data: { prefix, scopes: input.scopes } });
    return { ...present(row!), token };
  });
}

export async function listApiTokens(ctx: TenantCtx) {
  requirePermission(ctx, "org.manage");
  const rows = await getDb().select({ t: schema.apiTokens, name: schema.users.name }).from(schema.apiTokens)
    .leftJoin(schema.users, eq(schema.users.id, schema.apiTokens.createdBy))
    .where(eq(schema.apiTokens.orgId, ctx.orgId)).orderBy(asc(schema.apiTokens.revokedAt), desc(schema.apiTokens.createdAt));
  return rows.map((r) => present(r.t, r.name));
}

export async function revokeApiToken(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "org.manage");
  const db = getDb();
  const [t] = await db.select().from(schema.apiTokens).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.orgId, ctx.orgId)));
  if (!t) throw notFound("Token");
  if (t.revokedAt) return { ok: true };
  await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "integration.token_revoke", entityType: "api_token", entityId: id,
    summary: `Token de API "${t.name}" revogado.`, data: { prefix: t.prefix } });
  return { ok: true };
}

export interface ApiTokenCtx {
  tokenId: string;
  tokenName: string;
  prefix: string;
  orgId: string;
  scopes: ApiScope[];
  /** quem criou o token (para o registro de auditoria) */
  createdBy: string;
}

/** Valida um token de API. null = inexistente, revogado ou conta excluída. Atualiza "último uso" (no máximo 1x/min). */
export async function authenticateApiToken(token: string, now = new Date()): Promise<ApiTokenCtx | null> {
  if (!/^evk_[a-z0-9]{8}_[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const db = getDb();
  const [row] = await db.select({ t: schema.apiTokens, deletedAt: schema.organizations.deletedAt }).from(schema.apiTokens)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.apiTokens.orgId))
    .where(eq(schema.apiTokens.tokenHash, sha256(token)));
  if (!row || row.t.revokedAt || row.deletedAt) return null;
  const t = row.t;
  await db.update(schema.apiTokens).set({ lastUsedAt: now })
    .where(and(eq(schema.apiTokens.id, t.id), or(isNull(schema.apiTokens.lastUsedAt), lt(schema.apiTokens.lastUsedAt, new Date(now.getTime() - 60_000)))));
  return { tokenId: t.id, tokenName: t.name, prefix: t.prefix, orgId: t.orgId, scopes: t.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)), createdBy: t.createdBy };
}

// =====================================================================================
// API pública v1 — produtos e preços (usada por src/app/api/v1/**)
// =====================================================================================

const MAX_CENTS = 100_000_000;
export const MAX_PRICE_LINES = 1000;

/**
 * Regras de valor (explícitas para evitar arredondamento de ponto flutuante):
 * - `regularCents` / `promoCents`: número INTEIRO de centavos (1290 = R$ 12,90), ou null para apagar.
 * - `regularPrice` / `promoPrice`: TEXTO decimal com até 2 casas, ponto ou vírgula, sem separador de milhar
 *   ("12.90", "12,9", "1290"), ou null para apagar. Número (12.9) é recusado: envie como texto ou em centavos.
 * - Campo ausente = não altera. Informar Cents e Price do mesmo preço na mesma linha é erro.
 */
export function decimalToCents(v: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

type PriceField = "regular" | "promo";
type LineResult = {
  line: number; status: "updated" | "unchanged" | "created" | "not_found" | "ambiguous" | "invalid";
  productId?: string; barcode?: string | null; message?: string; warnings?: string[];
  regularCents?: number | null; promoCents?: number | null;
};

const lineSchema = z.object({
  productId: z.string().trim().min(1).max(64).optional(),
  barcode: z.union([z.string(), z.number()]).transform((v) => String(v).replace(/\s/g, "")).optional(),
  regularCents: z.unknown().optional(), promoCents: z.unknown().optional(),
  regularPrice: z.unknown().optional(), promoPrice: z.unknown().optional(),
  // somente para cadastrar produto desconhecido (escopo products.write)
  name: z.string().trim().max(120).optional(),
  unit: z.string().trim().max(10).optional(),
  brand: z.string().trim().max(60).optional(),
  category: z.string().trim().max(60).optional(),
  sizeLabel: z.string().trim().max(40).optional(),
});

const batchSchema = z.object({
  storeId: z.string().trim().min(1).max(64).optional().nullable(),
  items: z.array(z.unknown()).min(1, "Envie pelo menos uma linha em items.").max(MAX_PRICE_LINES, `No máximo ${MAX_PRICE_LINES} linhas por requisição.`),
});

/** Lê um preço da linha: undefined = não altera; null = apagar; número = centavos. Lança mensagem em caso de erro. */
function readPrice(raw: Record<string, unknown>, f: PriceField): number | null | undefined {
  const c = raw[`${f}Cents`]; const p = raw[`${f}Price`];
  const label = f === "regular" ? "preço normal" : "preço promocional";
  if (c !== undefined && p !== undefined) throw new Error(`Informe ${f}Cents OU ${f}Price, não os dois.`);
  if (c !== undefined) {
    if (c === null) return null;
    if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > MAX_CENTS) throw new Error(`${f}Cents deve ser um número inteiro de centavos entre 0 e ${MAX_CENTS} (${label}).`);
    return c;
  }
  if (p !== undefined) {
    if (p === null) return null;
    if (typeof p !== "string") throw new Error(`${f}Price deve ser texto decimal (ex.: "12.90"). Para números, use ${f}Cents em centavos inteiros.`);
    const v = decimalToCents(p);
    if (v === null || v > MAX_CENTS) throw new Error(`${f}Price inválido: "${p}". Use até 2 casas decimais, sem separador de milhar (ex.: "1234.50").`);
    return v;
  }
  return undefined;
}

function priceWarnings(regular: number | null, promo: number | null): string[] {
  const w: string[] = [];
  if (regular === 0 || promo === 0) w.push("Preço igual a zero.");
  if (regular != null && promo != null && promo > regular) w.push("Preço promocional maior que o preço normal.");
  return w;
}

async function apiStore(api: ApiTokenCtx, storeId: string | null | undefined) {
  if (!storeId) return null;
  const [s] = await getDb().select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.orgId, api.orgId), isNull(schema.stores.deletedAt)));
  if (!s) throw new AppError("not_found", "Loja não encontrada nesta conta.");
  return s;
}

/** GET /api/v1/stores — lojas da conta do token (para descobrir o storeId). */
export async function apiListStores(api: ApiTokenCtx) {
  const rows = await getDb().select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug }).from(schema.stores)
    .where(and(eq(schema.stores.orgId, api.orgId), isNull(schema.stores.deletedAt))).orderBy(asc(schema.stores.createdAt));
  return { stores: rows };
}

/** GET /api/v1/products — catálogo da conta do token. Nunca inclui custo. */
export async function apiListProducts(api: ApiTokenCtx, q: { barcode?: string | null; q?: string | null; updatedSince?: string | null; storeId?: string | null; cursor?: string | null; limit?: string | null }) {
  const limit = Math.min(Math.max(Number(q.limit ?? 100) || 100, 1), 500);
  const conds = [eq(schema.products.orgId, api.orgId), isNull(schema.products.archivedAt)];
  if (q.barcode) conds.push(eq(schema.products.barcode, q.barcode.replace(/\D/g, "")));
  if (q.q?.trim()) conds.push(ilike(schema.products.normalizedName, `%${normalizeName(q.q).replace(/[%_]/g, "")}%`));
  if (q.updatedSince) {
    const d = new Date(q.updatedSince);
    if (isNaN(+d)) throw new AppError("validation", "updatedSince inválido: use data ISO 8601 (ex.: 2026-10-01T00:00:00Z).");
    conds.push(gt(schema.products.updatedAt, d));
  }
  if (q.cursor) conds.push(gt(schema.products.id, q.cursor));
  const store = await apiStore(api, q.storeId);
  const rows = await getDb().select({
    id: schema.products.id, name: schema.products.name, brand: schema.products.brand, category: schema.products.category,
    sizeLabel: schema.products.sizeLabel, unit: schema.products.unit, barcode: schema.products.barcode,
    regularCents: schema.products.regularCents, promoCents: schema.products.promoCents, updatedAt: schema.products.updatedAt,
  }).from(schema.products).where(and(...conds)).orderBy(asc(schema.products.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  let storePrices = new Map<string, { regularCents: number | null; promoCents: number | null }>();
  if (store && page.length) {
    const sp = await getDb().select().from(schema.storePrices).where(and(eq(schema.storePrices.orgId, api.orgId), eq(schema.storePrices.storeId, store.id), inArray(schema.storePrices.productId, page.map((p) => p.id))));
    storePrices = new Map(sp.map((s) => [s.productId, { regularCents: s.regularCents, promoCents: s.promoCents }]));
  }
  return {
    products: page.map((p) => (store ? { ...p, storePrice: storePrices.get(p.id) ?? null } : p)),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

/**
 * PUT /api/v1/products/prices — atualização de preços em lote, idempotente.
 * Cada linha identifica o produto por `productId` ou `barcode` (EAN/GTIN). Resultado por linha.
 * Código desconhecido é informado (not_found). Só cadastra produto novo se o token tiver products.write E a linha
 * trouxer name, unit e barcode válidos — nunca inventa dados.
 */
export async function apiUpsertPrices(api: ApiTokenCtx, raw: unknown) {
  const body = batchSchema.parse(raw);
  const store = await apiStore(api, body.storeId);
  const canCreate = api.scopes.includes("products.write");
  const db = getDb();

  // 1) valida as linhas
  type Parsed = { line: number; productId?: string; barcode?: string; regular?: number | null; promo?: number | null; create?: { name: string; unit: string; brand: string | null; category: string | null; sizeLabel: string | null }; nameGiven: boolean };
  const results: LineResult[] = [];
  const parsed: Parsed[] = [];
  body.items.forEach((item, i) => {
    const line = i + 1;
    if (!item || typeof item !== "object" || Array.isArray(item)) { results.push({ line, status: "invalid", message: "Linha deve ser um objeto JSON." }); return; }
    const r = lineSchema.safeParse(item);
    if (!r.success) { results.push({ line, status: "invalid", message: r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") }); return; }
    const l = r.data;
    if (!l.productId && !l.barcode) { results.push({ line, status: "invalid", message: "Informe productId ou barcode." }); return; }
    if (l.barcode && !/^\d{8,14}$/.test(l.barcode)) { results.push({ line, status: "invalid", barcode: l.barcode, message: "barcode deve ter de 8 a 14 dígitos (EAN/GTIN)." }); return; }
    let regular: number | null | undefined, promo: number | null | undefined;
    try { regular = readPrice(item as Record<string, unknown>, "regular"); promo = readPrice(item as Record<string, unknown>, "promo"); }
    catch (e) { results.push({ line, status: "invalid", barcode: l.barcode ?? null, message: (e as Error).message }); return; }
    if (regular === undefined && promo === undefined) { results.push({ line, status: "invalid", barcode: l.barcode ?? null, message: "Nenhum preço informado (regularCents/regularPrice ou promoCents/promoPrice)." }); return; }
    let create: Parsed["create"];
    if (l.name && l.unit && l.barcode) {
      const u = unitSchema.safeParse(l.unit.toLowerCase());
      if (u.success) create = { name: l.name, unit: u.data, brand: l.brand || null, category: l.category || null, sizeLabel: l.sizeLabel || null };
    }
    parsed.push({ line, productId: l.productId, barcode: l.barcode, regular, promo, create, nameGiven: !!l.name });
  });

  // 2) localiza os produtos da conta (somente da conta do token)
  const ids = [...new Set(parsed.map((p) => p.productId).filter(Boolean) as string[])];
  const codes = [...new Set(parsed.map((p) => p.barcode).filter(Boolean) as string[])];
  const byId = new Map<string, typeof schema.products.$inferSelect>();
  const byCode = new Map<string, Array<typeof schema.products.$inferSelect>>();
  if (ids.length) for (const p of await db.select().from(schema.products).where(and(eq(schema.products.orgId, api.orgId), inArray(schema.products.id, ids)))) byId.set(p.id, p);
  if (codes.length) for (const p of await db.select().from(schema.products).where(and(eq(schema.products.orgId, api.orgId), inArray(schema.products.barcode, codes), isNull(schema.products.archivedAt)))) byCode.set(p.barcode!, [...(byCode.get(p.barcode!) ?? []), p]);

  const summary = { updated: 0, unchanged: 0, created: 0, notFound: 0, ambiguous: 0, invalid: 0 };
  await db.transaction(async (tx) => {
    const seen = new Set<string>();
    for (const p of parsed) {
      let prod: typeof schema.products.$inferSelect | undefined;
      if (p.productId) {
        prod = byId.get(p.productId);
        if (prod && p.barcode && prod.barcode !== p.barcode) { results.push({ line: p.line, status: "invalid", productId: p.productId, barcode: p.barcode, message: "productId e barcode apontam para produtos diferentes." }); continue; }
        if (prod?.archivedAt) { results.push({ line: p.line, status: "invalid", productId: prod.id, message: "Produto arquivado: reative-o no aplicativo antes de atualizar o preço." }); continue; }
      } else if (p.barcode) {
        const hits = byCode.get(p.barcode) ?? [];
        if (hits.length > 1) { results.push({ line: p.line, status: "ambiguous", barcode: p.barcode, message: `${hits.length} produtos com este código de barras. Use productId ou resolva os duplicados no aplicativo.` }); continue; }
        prod = hits[0];
      }
      const key = prod?.id ?? `code:${p.barcode}`;
      if (seen.has(key)) { results.push({ line: p.line, status: "invalid", productId: prod?.id, barcode: p.barcode ?? null, message: "Produto repetido no mesmo lote; envie uma linha por produto." }); continue; }
      seen.add(key);

      if (!prod) {
        if (!p.create || !canCreate) {
          const why = !p.nameGiven ? "Código não encontrado nesta conta." :
            !canCreate ? "Código não encontrado. Para cadastrar, o token precisa da permissão products.write." :
            "Código não encontrado. Para cadastrar, envie name, unit (ex.: un, kg) e barcode válidos.";
          results.push({ line: p.line, status: "not_found", productId: p.productId, barcode: p.barcode ?? null, message: why });
          continue;
        }
        const id = `prd_${tokId()}`;
        const catalogRegular = store ? null : p.regular ?? null;
        const catalogPromo = store ? null : p.promo ?? null;
        await tx.insert(schema.products).values({ id, orgId: api.orgId, name: p.create.name, brand: p.create.brand, category: p.create.category, sizeLabel: p.create.sizeLabel,
          unit: p.create.unit, barcode: p.barcode!, regularCents: catalogRegular, promoCents: catalogPromo, normalizedName: normalizeName(p.create.name) });
        if (store) await tx.insert(schema.storePrices).values({ orgId: api.orgId, storeId: store.id, productId: id, regularCents: p.regular ?? null, promoCents: p.promo ?? null });
        results.push({ line: p.line, status: "created", productId: id, barcode: p.barcode ?? null, regularCents: p.regular ?? null, promoCents: p.promo ?? null, warnings: priceWarnings(p.regular ?? null, p.promo ?? null) });
        continue;
      }

      if (store) {
        const [cur] = await tx.select().from(schema.storePrices).where(and(eq(schema.storePrices.storeId, store.id), eq(schema.storePrices.productId, prod.id), eq(schema.storePrices.orgId, api.orgId)));
        const nextRegular = p.regular === undefined ? cur?.regularCents ?? null : p.regular;
        const nextPromo = p.promo === undefined ? cur?.promoCents ?? null : p.promo;
        if (cur && cur.regularCents === nextRegular && cur.promoCents === nextPromo) {
          results.push({ line: p.line, status: "unchanged", productId: prod.id, barcode: prod.barcode, regularCents: nextRegular, promoCents: nextPromo }); continue;
        }
        await tx.insert(schema.storePrices).values({ orgId: api.orgId, storeId: store.id, productId: prod.id, regularCents: nextRegular, promoCents: nextPromo })
          .onConflictDoUpdate({ target: [schema.storePrices.storeId, schema.storePrices.productId], set: { regularCents: nextRegular, promoCents: nextPromo, updatedAt: new Date() } });
        results.push({ line: p.line, status: "updated", productId: prod.id, barcode: prod.barcode, regularCents: nextRegular, promoCents: nextPromo, warnings: priceWarnings(nextRegular, nextPromo) });
      } else {
        const nextRegular = p.regular === undefined ? prod.regularCents : p.regular;
        const nextPromo = p.promo === undefined ? prod.promoCents : p.promo;
        if (prod.regularCents === nextRegular && prod.promoCents === nextPromo) {
          results.push({ line: p.line, status: "unchanged", productId: prod.id, barcode: prod.barcode, regularCents: nextRegular, promoCents: nextPromo }); continue;
        }
        await tx.update(schema.products).set({ regularCents: nextRegular, promoCents: nextPromo, updatedAt: new Date() })
          .where(and(eq(schema.products.id, prod.id), eq(schema.products.orgId, api.orgId)));
        results.push({ line: p.line, status: "updated", productId: prod.id, barcode: prod.barcode, regularCents: nextRegular, promoCents: nextPromo, warnings: priceWarnings(nextRegular, nextPromo) });
      }
    }
    results.sort((a, b) => a.line - b.line);
    for (const r of results) {
      if (r.status === "not_found") summary.notFound++; else summary[r.status]++;
      if (r.warnings && !r.warnings.length) delete r.warnings;
    }
    if (summary.updated || summary.created) {
      await writeAudit(tx, { orgId: api.orgId, userId: api.createdBy, action: "product.api_prices", entityType: store ? "store" : "product", entityId: store?.id ?? null,
        summary: `Integração "${api.tokenName}" (token ${api.prefix}): ${summary.updated} preço(s) atualizado(s)${summary.created ? `, ${summary.created} produto(s) cadastrado(s)` : ""}${store ? ` na loja "${store.name}"` : " no catálogo"}; ${summary.notFound} código(s) não encontrado(s).`,
        data: { via: "api_v1", tokenId: api.tokenId, storeId: store?.id ?? null, ...summary, changes: results.filter((r) => r.status === "updated" || r.status === "created").slice(0, 200).map((r) => ({ productId: r.productId, regularCents: r.regularCents, promoCents: r.promoCents })) } });
    }
  });
  return { storeId: store?.id ?? null, summary, results };
}
