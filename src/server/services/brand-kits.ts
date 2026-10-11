import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { signedAssetUrl } from "../assets";

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida: use o formato #RRGGBB.");
export const colorsSchema = z.object({ primary: hex, secondary: hex, accent: hex, text: hex, background: hex });

export const DEFAULT_COLORS = { primary: "#C8102E", secondary: "#FFD100", accent: "#007A3D", text: "#1A1A1A", background: "#FFFFFF" };
export const DEFAULT_LEGAL = "Imagens meramente ilustrativas. Ofertas válidas enquanto durarem os estoques.";

const brandKitInput = z.object({
  name: z.string().trim().min(1).max(80),
  logoAssetId: z.string().nullable(),
  colors: colorsSchema,
  slogan: z.string().trim().max(120).transform((v) => v || null).nullable(),
  legalText: z.string().trim().max(400).transform((v) => v || null).nullable(),
});

function present(bk: typeof schema.brandKits.$inferSelect) {
  return { ...bk, logoUrl: bk.logoAssetId ? signedAssetUrl(bk.logoAssetId, bk.orgId, 3600) : null };
}

export async function insertBrandKit(orgId: string, name: string, db: Executor) {
  const [bk] = await db.insert(schema.brandKits).values({ id: newId("brk"), orgId, name, colors: DEFAULT_COLORS, legalText: DEFAULT_LEGAL }).returning();
  return bk!;
}

export async function listBrandKits(ctx: TenantCtx) {
  const rows = await getDb().select().from(schema.brandKits).where(eq(schema.brandKits.orgId, ctx.orgId)).orderBy(asc(schema.brandKits.createdAt));
  return rows.map(present);
}

async function assertLogo(ctx: TenantCtx, assetId: string | null | undefined) {
  if (!assetId) return;
  const [a] = await getDb().select({ id: schema.assets.id }).from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.kind, "image")));
  if (!a) throw new AppError("validation", "Logo não encontrado. Envie a imagem novamente.");
}

export async function createBrandKit(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "brand.manage");
  const input = brandKitInput.partial().required({ name: true }).parse(raw);
  await assertLogo(ctx, input.logoAssetId);
  const db = getDb();
  const [bk] = await db.insert(schema.brandKits).values({
    id: newId("brk"), orgId: ctx.orgId, name: input.name, logoAssetId: input.logoAssetId ?? null,
    colors: input.colors ?? DEFAULT_COLORS, slogan: input.slogan ?? null, legalText: input.legalText ?? DEFAULT_LEGAL,
  }).returning();
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "brand.create", entityType: "brand_kit", entityId: bk!.id, summary: `Identidade visual "${bk!.name}" criada.` });
  return present(bk!);
}

export async function updateBrandKit(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "brand.manage");
  const input = brandKitInput.partial().parse(raw);
  await assertLogo(ctx, input.logoAssetId);
  const db = getDb();
  const [bk] = await db.update(schema.brandKits).set({ ...input, updatedAt: new Date() })
    .where(and(eq(schema.brandKits.id, id), eq(schema.brandKits.orgId, ctx.orgId))).returning();
  if (!bk) throw notFound("Identidade visual");
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "brand.update", entityType: "brand_kit", entityId: id, summary: `Identidade visual "${bk.name}" atualizada.`, data: { fields: Object.keys(input) } });
  return present(bk);
}
