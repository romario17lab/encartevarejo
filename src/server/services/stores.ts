import { z } from "zod";
import { and, asc, count, eq, inArray, isNull, like, ne } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { slugify } from "../text";
import { writeAudit } from "../audit";
import { getAccessibleStore, requirePermission, storeScope } from "../tenant";
import { assertFeature, assertStoreLimit, getOrgPlan, orgUsage } from "./plans";
import { branchPreview, duplicateCampaign, getCampaignRow } from "./campaigns";
import { loadCampaignParts } from "./campaign-state";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const RESERVED_SLUGS = new Set(["app", "api", "admin", "login", "entrar", "cadastro", "loja", "lojas", "render", "dev", "conta", "vitrine", "static", "_next"]);

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();

/** WhatsApp: somente dígitos com DDI 55 (aceita com ou sem DDI e com máscara) */
export const whatsappSchema = z.string().trim().transform((v, ctx) => {
  if (!v) return null;
  let d = v.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) {
    ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Use DDD + número, ex.: (11) 99999-0000." });
    return z.NEVER;
  }
  return d;
}).nullable().optional();

const addressSchema = z.object({
  street: z.string().trim().max(120).optional(),
  number: z.string().trim().max(20).optional(),
  district: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().toUpperCase().refine((v) => !v || UFS.includes(v), "UF inválida (ex.: SP).").optional(),
  zip: z.string().trim().transform((v) => v.replace(/\D/g, "")).refine((v) => !v || v.length === 8, "CEP deve ter 8 dígitos.").optional(),
  complement: z.string().trim().max(80).optional(),
}).transform((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Record<string, string>);

const handle = (max: number) => z.string().trim().max(200).transform((v) => {
  if (!v) return undefined;
  const m = v.match(/(?:instagram|facebook|tiktok)\.com\/@?([A-Za-z0-9_.-]+)/i);
  return (m ? m[1]! : v.replace(/^@/, "")).slice(0, max);
}).refine((v) => v === undefined || /^[A-Za-z0-9_.-]+$/.test(v), "Perfil inválido: use apenas o nome do perfil, ex.: @mercadoexemplo.").optional();

const socialsSchema = z.object({
  instagram: handle(30),
  facebook: handle(80),
  tiktok: handle(30),
  website: z.string().trim().max(200).transform((v) => v || undefined)
    .refine((v) => v === undefined || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Site inválido: comece com https://").optional(),
}).transform((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Record<string, string>);

const hourRe = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/;
const hoursSchema = z.record(z.string().regex(/^[0-6]$/, "Dia inválido"), z.string().trim().regex(hourRe, "Horário no formato 07:00-21:00").nullable())
  .refine((h) => Object.values(h).every((v) => !v || v.split("-")[0]! < v.split("-")[1]!), "O horário de fechamento precisa ser depois da abertura.");

export const storeInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja.").max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "Endereço inválido: use letras minúsculas, números e hífen.").optional(),
  segment: z.string().trim().max(40).optional(),
  brandKitId: z.string().optional(),
  phone: opt(20),
  whatsapp: whatsappSchema,
  email: z.union([z.literal(""), z.email("E-mail inválido.")]).transform((v) => v || null).nullable().optional(),
  address: addressSchema.optional(),
  socials: socialsSchema.optional(),
  hours: hoursSchema.optional(),
  hoursNote: opt(120),
  storefrontEnabled: z.boolean().optional(),
});
export type StoreInput = z.input<typeof storeInputSchema>;

/** Gera um slug único (global) a partir do nome. */
export async function uniqueSlug(base: string, db: Executor = getDb(), exceptStoreId?: string): Promise<string> {
  let root = slugify(base);
  if (root.length < 3) root = `${root}-loja`;
  if (RESERVED_SLUGS.has(root)) root = `${root}-loja`;
  const rows = await db.select({ slug: schema.stores.slug, id: schema.stores.id }).from(schema.stores).where(like(schema.stores.slug, `${root}%`));
  const taken = new Set(rows.filter((r) => r.id !== exceptStoreId).map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 10000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

export function publicStore(s: typeof schema.stores.$inferSelect) {
  const { deletedAt: _d, ...rest } = s;
  return rest;
}

export async function listStores(ctx: TenantCtx) {
  const rows = await getDb().select().from(schema.stores)
    .where(and(eq(schema.stores.orgId, ctx.orgId), isNull(schema.stores.deletedAt), storeScope(ctx, schema.stores.id)))
    .orderBy(asc(schema.stores.createdAt));
  return rows.map(publicStore);
}

export async function getStore(ctx: TenantCtx, id: string) {
  return publicStore(await getAccessibleStore(ctx, id));
}

async function defaultBrandKitId(orgId: string, db: Executor): Promise<string> {
  const [bk] = await db.select({ id: schema.brandKits.id }).from(schema.brandKits).where(eq(schema.brandKits.orgId, orgId)).orderBy(asc(schema.brandKits.createdAt)).limit(1);
  if (!bk) throw new AppError("validation", "Cadastre uma identidade visual antes de criar lojas.");
  return bk.id;
}

async function assertBrandKit(orgId: string, id: string, db: Executor) {
  const [bk] = await db.select({ id: schema.brandKits.id }).from(schema.brandKits).where(and(eq(schema.brandKits.id, id), eq(schema.brandKits.orgId, orgId)));
  if (!bk) throw new AppError("validation", "Identidade visual não encontrada nesta conta.");
}

/** Cria loja sem checar permissão (usado no cadastro e internamente). */
export async function insertStore(orgId: string, input: z.output<typeof storeInputSchema>, db: Executor) {
  const brandKitId = input.brandKitId ?? (await defaultBrandKitId(orgId, db));
  await assertBrandKit(orgId, brandKitId, db);
  let slug: string;
  if (input.slug) {
    const [taken] = await db.select({ id: schema.stores.id }).from(schema.stores).where(eq(schema.stores.slug, input.slug));
    if (taken || RESERVED_SLUGS.has(input.slug)) throw new AppError("conflict", "Este endereço da vitrine já está em uso. Escolha outro.");
    slug = input.slug;
  } else slug = await uniqueSlug(input.name, db);
  const [store] = await db.insert(schema.stores).values({
    id: newId("sto"), orgId, brandKitId, name: input.name, slug, segment: input.segment ?? "supermercado",
    phone: input.phone ?? null, whatsapp: input.whatsapp ?? null, email: input.email ?? null,
    address: input.address ?? {}, socials: input.socials ?? {}, hours: input.hours ?? {}, hoursNote: input.hoursNote ?? null,
    storefrontEnabled: input.storefrontEnabled ?? true,
  }).returning();
  return store!;
}

export async function createStore(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "stores.manage");
  const input = storeInputSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    // trava a conta para que duas criações simultâneas não ultrapassem o limite
    await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    await assertStoreLimit(ctx.orgId, tx);
    const store = await insertStore(ctx.orgId, input, tx);
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "store.create", entityType: "store", entityId: store.id, summary: `Loja "${store.name}" cadastrada.` });
    return publicStore(store);
  });
}

export async function updateStore(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "stores.manage");
  const input = storeInputSchema.partial().parse(raw);
  const db = getDb();
  const current = await getAccessibleStore(ctx, id);
  const patch: Partial<typeof schema.stores.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["name", "segment", "phone", "whatsapp", "email", "address", "socials", "hours", "hoursNote", "storefrontEnabled"] as const) {
    if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
  }
  if (input.brandKitId) { await assertBrandKit(ctx.orgId, input.brandKitId, db); patch.brandKitId = input.brandKitId; }
  if (input.slug && input.slug !== current.slug) {
    const [taken] = await db.select({ id: schema.stores.id }).from(schema.stores).where(and(eq(schema.stores.slug, input.slug), ne(schema.stores.id, id)));
    if (taken || RESERVED_SLUGS.has(input.slug)) throw new AppError("conflict", "Este endereço da vitrine já está em uso. Escolha outro.");
    patch.slug = input.slug;
  }
  const [store] = await db.update(schema.stores).set(patch).where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId))).returning();
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "store.update", entityType: "store", entityId: id, summary: `Dados da loja "${store!.name}" atualizados.`, data: { fields: Object.keys(input) } });
  return publicStore(store!);
}

export async function deleteStore(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "stores.manage");
  const db = getDb();
  const store = await getAccessibleStore(ctx, id);
  const [n] = await db.select({ n: count() }).from(schema.stores).where(and(eq(schema.stores.orgId, ctx.orgId), isNull(schema.stores.deletedAt)));
  if (n!.n <= 1) throw new AppError("validation", "A conta precisa ter pelo menos uma loja.");
  await db.update(schema.stores).set({ deletedAt: new Date(), storefrontEnabled: false, updatedAt: new Date() }).where(and(eq(schema.stores.id, id), eq(schema.stores.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "store.delete", entityType: "store", entityId: id, summary: `Loja "${store.name}" excluída.` });
  return { ok: true };
}

// ---------------- Rede de lojas (filiais) ----------------

/** Recusa operações entre filiais quando o plano da conta não inclui o recurso "filiais". */
export async function assertBranchesFeature(orgId: string, db: Executor = getDb()) {
  await assertFeature(orgId, "filiais", db);
}

/** Visão das lojas para a tela de filiais: identidade usada, quantidade de preços próprios e uso do plano. */
export async function storesOverview(ctx: TenantCtx) {
  const db = getDb();
  const stores = await listStores(ctx);
  const kits = await db.select({ id: schema.brandKits.id, name: schema.brandKits.name }).from(schema.brandKits).where(eq(schema.brandKits.orgId, ctx.orgId)).orderBy(asc(schema.brandKits.createdAt));
  const ids = stores.map((s) => s.id);
  const prices = ids.length ? await db.select({ storeId: schema.storePrices.storeId, n: count() }).from(schema.storePrices)
    .where(and(eq(schema.storePrices.orgId, ctx.orgId), inArray(schema.storePrices.storeId, ids))).groupBy(schema.storePrices.storeId) : [];
  const priceCount = new Map(prices.map((p) => [p.storeId, p.n]));
  const plan = await getOrgPlan(ctx.orgId, db);
  const usage = await orgUsage(ctx.orgId, db);
  const kitName = new Map(kits.map((k) => [k.id, k.name]));
  return {
    stores: stores.map((s) => ({ ...s, brandKitName: kitName.get(s.brandKitId) ?? null, priceOverrides: priceCount.get(s.id) ?? 0 })),
    brandKits: kits.map((k, i) => ({ ...k, isDefault: i === 0, storeCount: stores.filter((s) => s.brandKitId === k.id).length })),
    plan: { id: plan.id, name: plan.name, storeLimit: plan.limits.stores, storesUsed: usage.stores, branchesFeature: (plan.limits.features ?? []).includes("filiais") },
    restricted: ctx.storeIds !== null,
  };
}

type StoreRow = typeof schema.stores.$inferSelect;
export type BranchAttention = "item_manual" | "produto_fora_do_catalogo" | "combo_mantido" | "sem_preco" | "promocao_sem_preco_na_filial";

const ATTENTION_TEXT: Record<BranchAttention, string> = {
  item_manual: "Item digitado na campanha (sem produto do catálogo): o preço da campanha original foi mantido.",
  produto_fora_do_catalogo: "O produto não está mais no catálogo: o preço da campanha original foi mantido.",
  combo_mantido: "Combo: o preço do combo foi mantido. Confira se vale nesta filial.",
  sem_preco: "Sem preço nesta filial nem no catálogo: o preço da campanha original foi mantido.",
  promocao_sem_preco_na_filial: "Oferta \"de/por\", mas a filial não tem preço promocional cadastrado: o preço da campanha original foi mantido.",
};

function addressLine(a: StoreRow["address"]) {
  const parts = [[a.street, a.number].filter(Boolean).join(", "), a.district, [a.city, a.state].filter(Boolean).join("/")].filter(Boolean);
  return parts.join(" – ") || null;
}

const WEEK_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function hoursText(h: Record<string, string | null>) {
  const days = Object.keys(h).filter((d) => /^[0-6]$/.test(d)).sort();
  if (!days.length) return null;
  return days.map((d) => `${WEEK_SHORT[Number(d)]} ${h[d] ? h[d]!.replace("-", "–") : "fechado"}`).join(", ");
}

function contactFields(s: StoreRow) {
  return {
    endereço: addressLine(s.address ?? {}),
    telefone: s.phone ?? null,
    WhatsApp: s.whatsapp ?? null,
    "e-mail": s.email ?? null,
    horários: hoursText(s.hours ?? {}),
    "observação de horário": s.hoursNote ?? null,
  };
}

/**
 * Prévia da cópia de uma campanha para filiais. Combina os preços calculados pelo serviço de campanhas
 * (branchPreview) com o que precisa de atenção (itens sem preço na filial) e as diferenças de endereço/contatos.
 * Nunca inventa preço: quando a filial e o catálogo não têm preço, o item mantém o preço original e é sinalizado.
 */
export async function branchCopyPreview(ctx: TenantCtx, campaignId: string, storeIds: string[]) {
  requirePermission(ctx, "campaigns.read");
  const ids = [...new Set(storeIds.filter(Boolean))];
  if (!ids.length) throw new AppError("validation", "Escolha pelo menos uma filial.");
  if (ids.length > 50) throw new AppError("validation", "Escolha no máximo 50 filiais por vez.");
  const db = getDb();
  const src = await getCampaignRow(ctx, campaignId, db);
  if (ids.some((id) => id !== src.storeId)) await assertBranchesFeature(ctx.orgId, db);
  const base = await branchPreview(ctx, campaignId, ids);
  const { items } = await loadCampaignParts(db, ctx.orgId, campaignId);
  const [srcStore] = await db.select().from(schema.stores).where(and(eq(schema.stores.id, src.storeId), eq(schema.stores.orgId, ctx.orgId)));
  const pids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = pids.length ? await db.select({ id: schema.products.id, regularCents: schema.products.regularCents, promoCents: schema.products.promoCents })
    .from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), inArray(schema.products.id, pids))) : [];
  const productMap = new Map(products.map((p) => [p.id, p]));
  const kits = await db.select({ id: schema.brandKits.id, name: schema.brandKits.name }).from(schema.brandKits).where(eq(schema.brandKits.orgId, ctx.orgId));
  const kitName = new Map(kits.map((k) => [k.id, k.name]));

  const out = [];
  for (const b of base.stores) {
    const store = await getAccessibleStore(ctx, b.storeId, db);
    const sps = pids.length ? await db.select().from(schema.storePrices)
      .where(and(eq(schema.storePrices.orgId, ctx.orgId), eq(schema.storePrices.storeId, store.id), inArray(schema.storePrices.productId, pids))) : [];
    const spMap = new Map(sps.map((r) => [r.productId, r]));
    const same = store.id === src.storeId;
    const attention: Array<{ itemId: string; name: string; reason: BranchAttention; message: string; priceCents: number | null }> = [];
    let usesCatalog = 0;
    let usesStorePrice = 0;
    if (!same) {
      for (const it of items) {
        let reason: BranchAttention | null = null;
        const p = it.productId ? productMap.get(it.productId) : undefined;
        const sp = it.productId ? spMap.get(it.productId) : undefined;
        if (!it.productId) reason = "item_manual";
        else if (!p) reason = "produto_fora_do_catalogo";
        else if (it.offer.mode === "combo") reason = "combo_mantido";
        else {
          const regular = sp ? sp.regularCents ?? p.regularCents : p.regularCents;
          const promo = sp ? sp.promoCents : p.promoCents;
          if (it.offer.mode === "from_to" && (promo == null || regular == null)) reason = sp && regular != null ? "promocao_sem_preco_na_filial" : "sem_preco";
          else if ((promo ?? regular) == null) reason = "sem_preco";
          else if (sp) usesStorePrice++;
          else usesCatalog++;
        }
        if (reason) attention.push({ itemId: it.id, name: it.name, reason, message: ATTENTION_TEXT[reason], priceCents: it.offer.priceCents });
      }
    }
    const a = srcStore ? contactFields(srcStore) : null;
    const bf = contactFields(store);
    const contactChanges = same || !a ? [] : (Object.keys(bf) as Array<keyof typeof bf>)
      .filter((k) => (a[k] ?? null) !== (bf[k] ?? null))
      .map((k) => ({ field: k, from: a[k], to: bf[k] }));
    out.push({
      ...b,
      sameStore: same,
      storeSlug: store.slug,
      brandKitName: kitName.get(store.brandKitId) ?? null,
      sameBrandKit: !!srcStore && srcStore.brandKitId === store.brandKitId,
      attention,
      usesStorePriceCount: usesStorePrice,
      usesCatalogCount: usesCatalog,
      contactChanges,
    });
  }
  return { sourceStoreId: src.storeId, sourceStoreName: srcStore?.name ?? null, itemCount: items.length, stores: out };
}

/** Duplica a campanha para as filiais escolhidas. As cópias nascem em rascunho e seguem o fluxo normal de aprovação. */
export async function duplicateToBranches(ctx: TenantCtx, campaignId: string, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = z.object({ storeIds: z.array(z.string().min(1)).min(1, "Escolha pelo menos uma filial.").max(50, "Escolha no máximo 50 filiais por vez.") }).parse(raw ?? {});
  const db = getDb();
  const src = await getCampaignRow(ctx, campaignId, db);
  if (input.storeIds.some((id) => id !== src.storeId)) await assertBranchesFeature(ctx.orgId, db);
  return duplicateCampaign(ctx, campaignId, { storeIds: input.storeIds });
}
