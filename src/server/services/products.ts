import { z } from "zod";
import { and, asc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { can } from "@/domain/campaign";
import { unitSchema } from "@/domain/offer";
import { formatBRL } from "@/domain/money";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { normalizeName, similarity } from "../text";
import { writeAudit } from "../audit";
import { getAccessibleStore, requirePermission } from "../tenant";

type ProductRow = typeof schema.products.$inferSelect;

const cents = z.number().int("Valor em centavos deve ser inteiro.").min(0, "Valor não pode ser negativo.").max(100_000_000);
const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do produto.").max(120),
  brand: optText(60),
  category: optText(60),
  sizeLabel: optText(40),
  unit: unitSchema.nullable().optional(),
  barcode: z.string().trim().transform((v) => v.replace(/\s/g, "")).refine((v) => !v || /^\d{8,14}$/.test(v), "Código de barras deve ter de 8 a 14 dígitos.")
    .transform((v) => v || null).nullable().optional(),
  imageAssetId: z.string().nullable().optional(),
  regularCents: cents.nullable().optional(),
  promoCents: cents.nullable().optional(),
  costCents: cents.nullable().optional(),
  conditions: optText(160),
});
export type ProductInput = z.output<typeof productInputSchema>;

export function productIssues(p: Pick<ProductRow, "imageAssetId" | "unit" | "regularCents" | "promoCents">) {
  const issues: string[] = [];
  if (!p.imageAssetId) issues.push("sem_imagem");
  if (!p.unit) issues.push("sem_unidade");
  if (p.regularCents == null && p.promoCents == null) issues.push("sem_preco");
  return issues;
}

/** Produto para as telas privadas do catálogo. Custo só para quem edita o catálogo. */
export function presentProduct(ctx: TenantCtx, p: ProductRow) {
  const { costCents, orgId: _o, ...rest } = p;
  return {
    ...rest,
    ...(can(ctx.role, "products.write") ? { costCents } : {}),
    imageUrl: p.imageAssetId ? `/api/assets/${p.imageAssetId}` : null,
    issues: productIssues(p),
  };
}

async function assertImage(ctx: TenantCtx, assetId: string | null | undefined, db: Executor) {
  if (!assetId) return;
  const [a] = await db.select({ id: schema.assets.id }).from(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.kind, "image")));
  if (!a) throw new AppError("validation", "Imagem não encontrada nesta conta.");
}

export async function getProductRow(ctx: TenantCtx, id: string, db: Executor = getDb()) {
  const [p] = await db.select().from(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.orgId, ctx.orgId)));
  if (!p) throw notFound("Produto");
  return p;
}

export async function getProduct(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "products.read");
  return presentProduct(ctx, await getProductRow(ctx, id));
}

export interface ProductListQuery {
  q?: string | null;
  category?: string | null;
  issues?: string | null; // sem_imagem | incompleto
  cursor?: string | null;
  limit?: number;
  archived?: boolean;
}

export async function listProducts(ctx: TenantCtx, q: ProductListQuery) {
  requirePermission(ctx, "products.read");
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const conds: (SQL | undefined)[] = [eq(schema.products.orgId, ctx.orgId), q.archived ? isNotNull(schema.products.archivedAt) : isNull(schema.products.archivedAt)];
  if (q.q?.trim()) {
    const term = normalizeName(q.q);
    const digits = q.q.replace(/\D/g, "");
    conds.push(or(ilike(schema.products.normalizedName, `%${term.replace(/[%_]/g, "")}%`), digits.length >= 4 ? eq(schema.products.barcode, digits) : undefined));
  }
  if (q.category?.trim()) conds.push(sql`lower(${schema.products.category}) = ${q.category.trim().toLowerCase()}`);
  if (q.issues === "sem_imagem") conds.push(isNull(schema.products.imageAssetId));
  if (q.issues === "incompleto") conds.push(or(isNull(schema.products.unit), and(isNull(schema.products.regularCents), isNull(schema.products.promoCents)), isNull(schema.products.imageAssetId)));
  if (q.cursor) {
    try {
      const [n, id] = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")) as [string, string];
      conds.push(or(gt(schema.products.normalizedName, n), and(eq(schema.products.normalizedName, n), gt(schema.products.id, id))));
    } catch { throw new AppError("validation", "Cursor inválido."); }
  }
  const rows = await getDb().select().from(schema.products).where(and(...conds))
    .orderBy(asc(schema.products.normalizedName), asc(schema.products.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    products: page.map((p) => presentProduct(ctx, p)),
    nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify([last.normalizedName, last.id])).toString("base64url") : null,
  };
}

export async function listCategories(ctx: TenantCtx) {
  requirePermission(ctx, "products.read");
  const rows = await getDb().selectDistinct({ category: schema.products.category }).from(schema.products)
    .where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt), isNotNull(schema.products.category)));
  return rows.map((r) => r.category!).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function insertProduct(ctx: TenantCtx, input: ProductInput, db: Executor) {
  const [p] = await db.insert(schema.products).values({
    id: newId("prd"), orgId: ctx.orgId, name: input.name, brand: input.brand ?? null, category: input.category ?? null,
    sizeLabel: input.sizeLabel ?? null, unit: input.unit ?? null, barcode: input.barcode ?? null, imageAssetId: input.imageAssetId ?? null,
    regularCents: input.regularCents ?? null, promoCents: input.promoCents ?? null, costCents: input.costCents ?? null,
    conditions: input.conditions ?? null, normalizedName: normalizeName(input.name),
  }).returning();
  return p!;
}

export async function createProduct(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "products.write");
  const input = productInputSchema.parse(raw);
  const db = getDb();
  await assertImage(ctx, input.imageAssetId, db);
  const p = await insertProduct(ctx, input, db);
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "product.create", entityType: "product", entityId: p.id, summary: `Produto "${p.name}" cadastrado.` });
  return presentProduct(ctx, p);
}

export async function updateProduct(ctx: TenantCtx, id: string, raw: unknown, db: Executor = getDb()) {
  requirePermission(ctx, "products.write");
  const input = productInputSchema.partial().extend({ archived: z.boolean().optional() }).parse(raw);
  await getProductRow(ctx, id, db);
  await assertImage(ctx, input.imageAssetId, db);
  const { archived, ...fields } = input;
  const patch: Partial<typeof schema.products.$inferInsert> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  if (fields.name) patch.normalizedName = normalizeName(fields.name);
  if (archived !== undefined) patch.archivedAt = archived ? new Date() : null;
  const [p] = await db.update(schema.products).set(patch).where(and(eq(schema.products.id, id), eq(schema.products.orgId, ctx.orgId))).returning();
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "product.update", entityType: "product", entityId: id, summary: `Produto "${p!.name}" atualizado.`, data: { fields: Object.keys(fields).filter((k) => k !== "costCents") } });
  return presentProduct(ctx, p!);
}

/** "Excluir" arquiva: campanhas antigas continuam com o retrato do produto. */
export async function archiveProduct(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "products.write");
  const db = getDb();
  const [p] = await db.update(schema.products).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.products.id, id), eq(schema.products.orgId, ctx.orgId))).returning();
  if (!p) throw notFound("Produto");
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "product.archive", entityType: "product", entityId: id, summary: `Produto "${p.name}" arquivado.` });
  return { ok: true };
}

// ---------------- Atualização de preços em massa ----------------
const bulkSchema = z.object({
  changes: z.array(z.object({ productId: z.string(), regularCents: cents.nullable().optional(), promoCents: cents.nullable().optional() })).min(1).max(5000),
});

const pctChange = (oldV: number | null, newV: number | null | undefined) =>
  oldV && newV != null && oldV > 0 ? Math.round(((newV - oldV) * 1000) / oldV) / 10 : null;

export async function bulkPricePreview(ctx: TenantCtx, raw: unknown, db: Executor = getDb()) {
  requirePermission(ctx, "products.write");
  const { changes } = bulkSchema.parse(raw);
  const ids = [...new Set(changes.map((c) => c.productId))];
  const rows = await db.select().from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), inArray(schema.products.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new AppError("not_found", `${missing.length} produto(s) não encontrado(s) nesta conta.`, { productIds: missing });
  const items = changes.map((c) => {
    const p = byId.get(c.productId)!;
    const newRegular = c.regularCents === undefined ? p.regularCents : c.regularCents;
    const newPromo = c.promoCents === undefined ? p.promoCents : c.promoCents;
    const regularChangePct = c.regularCents === undefined ? null : pctChange(p.regularCents, newRegular);
    const promoChangePct = c.promoCents === undefined ? null : pctChange(p.promoCents, newPromo);
    const flags: string[] = [];
    const warnings: string[] = [];
    if ((regularChangePct ?? 0) > 30 || (promoChangePct ?? 0) > 30) { flags.push("aumento_acima_30"); warnings.push("Aumento acima de 30%. Confira o valor."); }
    if (newRegular === 0 || newPromo === 0) { flags.push("preco_zero"); warnings.push("Preço igual a zero."); }
    if (newPromo != null && newRegular != null && newPromo > newRegular) { flags.push("oferta_maior_que_normal"); warnings.push("Preço de oferta maior que o preço normal."); }
    return {
      productId: p.id, name: p.name, sizeLabel: p.sizeLabel,
      oldRegularCents: p.regularCents, newRegularCents: newRegular, oldPromoCents: p.promoCents, newPromoCents: newPromo,
      regularChangePct, promoChangePct, changed: newRegular !== p.regularCents || newPromo !== p.promoCents, flags, warnings,
    };
  });
  return { items, changedCount: items.filter((i) => i.changed).length, flaggedCount: items.filter((i) => i.flags.length).length };
}

export async function bulkPriceCommit(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "products.write");
  return getDb().transaction(async (tx) => {
    const preview = await bulkPricePreview(ctx, raw, tx);
    const changed = preview.items.filter((i) => i.changed);
    for (const i of changed) {
      await tx.update(schema.products).set({ regularCents: i.newRegularCents, promoCents: i.newPromoCents, updatedAt: new Date() })
        .where(and(eq(schema.products.id, i.productId), eq(schema.products.orgId, ctx.orgId)));
    }
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "product.bulk_price", entityType: "product", entityId: null,
      summary: `Preços atualizados em ${changed.length} produto(s).`,
      data: { changes: changed.map((i) => ({ productId: i.productId, name: i.name, regular: [i.oldRegularCents, i.newRegularCents], promo: [i.oldPromoCents, i.newPromoCents] })) } });
    return { updated: changed.length, items: preview.items };
  });
}

// ---------------- Prováveis duplicados ----------------
export async function findDuplicates(ctx: TenantCtx) {
  requirePermission(ctx, "products.read");
  const rows = await getDb().select().from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt)));
  const groups: Array<{ reason: "codigo_de_barras" | "nome_parecido"; products: ReturnType<typeof presentProduct>[] }> = [];
  const used = new Set<string>();
  const byBarcode = new Map<string, ProductRow[]>();
  for (const r of rows) if (r.barcode) byBarcode.set(r.barcode, [...(byBarcode.get(r.barcode) ?? []), r]);
  for (const list of byBarcode.values()) if (list.length > 1) {
    groups.push({ reason: "codigo_de_barras", products: list.map((p) => presentProduct(ctx, p)) });
    list.forEach((p) => used.add(p.id));
  }
  // nomes parecidos: compara apenas dentro do mesmo "balde" (primeira palavra) para evitar O(n²) global
  const sizeKey = (s: string | null) => normalizeName(s ?? "").replace(/\s/g, "");
  const buckets = new Map<string, ProductRow[]>();
  for (const r of rows) {
    if (used.has(r.id)) continue;
    const key = r.normalizedName.split(" ")[0] ?? "";
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 800) continue;
    const parent = new Map<string, string>(list.map((p) => [p.id, p.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!, b = list[j]!;
      if (sizeKey(a.sizeLabel) !== sizeKey(b.sizeLabel)) continue;
      if (a.barcode && b.barcode && a.barcode !== b.barcode) continue;
      if (Math.abs(a.normalizedName.length - b.normalizedName.length) > 6) continue;
      if (a.normalizedName === b.normalizedName || similarity(a.normalizedName, b.normalizedName) >= 0.85) parent.set(find(a.id), find(b.id));
    }
    const sets = new Map<string, ProductRow[]>();
    for (const p of list) sets.set(find(p.id), [...(sets.get(find(p.id)) ?? []), p]);
    for (const s of sets.values()) if (s.length > 1) groups.push({ reason: "nome_parecido", products: s.map((p) => presentProduct(ctx, p)) });
  }
  return { groups };
}

// ---------------- Preços por filial ----------------
export async function listStorePrices(ctx: TenantCtx, storeId: string) {
  requirePermission(ctx, "products.read");
  await getAccessibleStore(ctx, storeId);
  return getDb().select({
    productId: schema.storePrices.productId, regularCents: schema.storePrices.regularCents, promoCents: schema.storePrices.promoCents,
    updatedAt: schema.storePrices.updatedAt, name: schema.products.name, sizeLabel: schema.products.sizeLabel,
    productRegularCents: schema.products.regularCents, productPromoCents: schema.products.promoCents,
  }).from(schema.storePrices).innerJoin(schema.products, eq(schema.products.id, schema.storePrices.productId))
    .where(and(eq(schema.storePrices.orgId, ctx.orgId), eq(schema.storePrices.storeId, storeId))).orderBy(asc(schema.products.normalizedName));
}

const storePricesSchema = z.object({
  prices: z.array(z.object({ productId: z.string(), regularCents: cents.nullable(), promoCents: cents.nullable() })).min(1).max(5000),
});

export async function upsertStorePrices(ctx: TenantCtx, storeId: string, raw: unknown) {
  requirePermission(ctx, "products.write");
  const { prices } = storePricesSchema.parse(raw);
  const store = await getAccessibleStore(ctx, storeId);
  const ids = [...new Set(prices.map((p) => p.productId))];
  const db = getDb();
  const found = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), inArray(schema.products.id, ids)));
  if (found.length !== ids.length) throw new AppError("not_found", "Um ou mais produtos não foram encontrados nesta conta.");
  await db.transaction(async (tx) => {
    for (const p of prices) {
      await tx.insert(schema.storePrices).values({ orgId: ctx.orgId, storeId, productId: p.productId, regularCents: p.regularCents, promoCents: p.promoCents })
        .onConflictDoUpdate({ target: [schema.storePrices.storeId, schema.storePrices.productId], set: { regularCents: p.regularCents, promoCents: p.promoCents, updatedAt: new Date() } });
    }
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "store_price.update", entityType: "store", entityId: storeId, summary: `Preços específicos da loja "${store.name}" atualizados (${prices.length} produto(s)).` });
  });
  return listStorePrices(ctx, storeId);
}

export async function deleteStorePrice(ctx: TenantCtx, storeId: string, productId: string) {
  requirePermission(ctx, "products.write");
  const store = await getAccessibleStore(ctx, storeId);
  const db = getDb();
  const del = await db.delete(schema.storePrices).where(and(eq(schema.storePrices.orgId, ctx.orgId), eq(schema.storePrices.storeId, storeId), eq(schema.storePrices.productId, productId))).returning();
  if (!del.length) throw notFound("Preço da loja");
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "store_price.delete", entityType: "store", entityId: storeId, summary: `Preço específico removido na loja "${store.name}"; volta a valer o preço do catálogo.` });
  return { ok: true };
}

export const describePrice = (c: number | null) => (c == null ? "sem preço" : formatBRL(c));
