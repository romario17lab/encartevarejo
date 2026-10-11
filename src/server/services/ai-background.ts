import sharp, { type Metadata } from "sharp";
import { and, desc, eq } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { sha256 } from "../signing";
import { storage } from "../storage";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { aiConfig } from "../ai/config";
import { backgroundRemover } from "../ai/background";
import { AiNotConfiguredError } from "../ai/http";
import { runAiRequest } from "../ai/requests";
import { assertUsage } from "./plans";
import { MAX_OUTPUT_DIM } from "./assets";

// Remoção de fundo: cria um arquivo NOVO (origem "ia_remocao_fundo", parentAssetId = original).
// A imagem original nunca é alterada nem apagada; o usuário compara e escolhe qual usar.
// O provedor só recorta a foto real do lojista — nenhuma imagem de produto é gerada.

const present = (a: { id: string; width: number | null; height: number | null; source: string; parentAssetId: string | null }) =>
  ({ id: a.id, url: `/api/assets/${a.id}`, width: a.width, height: a.height, source: a.source, parentAssetId: a.parentAssetId });

export async function removeBackground(ctx: TenantCtx, assetId: string) {
  requirePermission(ctx, "products.write");
  const provider = backgroundRemover();
  if (!provider.isConfigured()) throw new AiNotConfiguredError("A remoção de fundo");
  const db = getDb();
  const [original] = await db.select().from(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.kind, "image")));
  if (!original) throw notFound("Imagem");
  if (original.source === "ia_remocao_fundo") throw new AppError("validation", "Esta imagem já é uma versão sem fundo.");

  // já existe versão sem fundo desta imagem: reaproveita, sem novo pedido nem créditos
  const [existing] = await db.select().from(schema.assets).where(and(eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.parentAssetId, original.id), eq(schema.assets.source, "ia_remocao_fundo")))
    .orderBy(desc(schema.assets.createdAt)).limit(1);
  if (existing) return { requestId: null, reused: true, original: present(original), result: present(existing) };

  const data = await storage.get(original.storageKey).catch(() => { throw notFound("Arquivo da imagem"); });
  const run = await runAiRequest(ctx, {
    kind: "remover_fundo", provider: provider.name, model: null, credits: aiConfig().credits.remover_fundo,
    inputSummary: { assetId: original.id, bytes: data.length, largura: original.width, altura: original.height },
  }, async () => {
    const png = await provider.remove(data, original.mime);
    let meta: Metadata;
    try { meta = await sharp(png, { failOn: "error" }).metadata(); } catch { throw new AppError("external_service", "A remoção de fundo devolveu um arquivo inválido. Tente de novo."); }
    if (!meta.format || !["png", "webp"].includes(meta.format)) throw new AppError("external_service", "A remoção de fundo devolveu um formato inesperado.");
    const out = await sharp(png).resize({ width: MAX_OUTPUT_DIM, height: MAX_OUTPUT_DIM, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    await assertUsage(ctx.orgId, "storage", out.data.length);
    const id = newId("ast");
    const storageKey = `${ctx.orgId}/images/${id}.png`;
    await storage.put(storageKey, out.data, "image/png");
    const sourceNote = `Fundo removido por IA (${provider.name}) a partir da imagem ${original.id}. A foto original foi mantida.`;
    const [row] = await db.insert(schema.assets).values({
      id, orgId: ctx.orgId, kind: "image", storageKey, mime: "image/png", bytes: out.data.length, width: out.info.width, height: out.info.height,
      sha256: sha256(out.data), source: "ia_remocao_fundo", parentAssetId: original.id, sourceNote,
      originalName: original.originalName ? `sem-fundo-${original.originalName}`.slice(0, 200) : null, createdBy: ctx.userId,
    }).returning();
    await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "asset.ai_background", entityType: "asset", entityId: id,
      summary: "Versão sem fundo criada por IA (a original foi mantida).", data: { parentAssetId: original.id, provider: provider.name } });
    return { result: row!, output: { assetId: id, parentAssetId: original.id, width: out.info.width, height: out.info.height } };
  });
  return { requestId: run.requestId, reused: false, original: present(original), result: present(run.result) };
}
