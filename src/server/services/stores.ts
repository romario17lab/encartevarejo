import { z } from "zod";
import { and, asc, count, eq, isNull, like, ne } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { slugify } from "../text";
import { writeAudit } from "../audit";
import { getAccessibleStore, requirePermission, storeScope } from "../tenant";
import { assertStoreLimit } from "./plans";

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
