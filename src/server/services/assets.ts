import sharp, { type Metadata, type OutputInfo } from "sharp";
import { and, eq } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { can } from "@/domain/campaign";
import { newId } from "../ids";
import { sha256 } from "../signing";
import { storage } from "../storage";
import { writeAudit } from "../audit";
import { signedAssetUrl, verifyAssetToken } from "../assets";
import { assertUsage } from "./plans";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_INPUT_DIM = 6000;
export const MAX_OUTPUT_DIM = 2000;
const SOURCES = ["upload_lojista", "importacao", "banco_autorizado", "demonstracao", "gerado_sistema"] as const;
type Source = (typeof SOURCES)[number];

export interface UploadInput {
  data: Buffer;
  originalName?: string | null;
  source?: string | null;
  sourceNote?: string | null;
}

/**
 * Valida a imagem pelo conteúdo real (sharp), normaliza (gira conforme EXIF, remove metadados,
 * reduz para no máximo 2000 px mantendo a proporção) e grava como WebP (PNG quando há transparência).
 * Arquivo idêntico (mesmo sha256 do original) na mesma conta reaproveita o registro existente.
 */
export async function uploadImage(ctx: TenantCtx, input: UploadInput) {
  // logo/identidade (brand.manage) ou fotos de produtos (products.write)
  if (!can(ctx.role, "products.write") && !can(ctx.role, "brand.manage")) throw forbidden();
  const { data } = input;
  if (!data.length) throw new AppError("validation", "Arquivo vazio.");
  if (data.length > MAX_UPLOAD_BYTES) throw new AppError("validation", "A imagem passa de 8 MB. Envie um arquivo menor.");
  const source: Source = (SOURCES as readonly string[]).includes(input.source ?? "") ? (input.source as Source) : "upload_lojista";
  const sourceNote = input.sourceNote?.trim().slice(0, 300) || null;

  let meta: Metadata;
  try { meta = await sharp(data, { failOn: "error" }).metadata(); } catch {
    throw new AppError("validation", "Não foi possível ler a imagem. Envie um arquivo JPG, PNG ou WebP válido.");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new AppError("validation", "Formato não aceito. Envie JPG, PNG ou WebP.");
  if (meta.pages && meta.pages > 1) throw new AppError("validation", "Imagens animadas não são aceitas.");
  if (!meta.width || !meta.height) throw new AppError("validation", "Imagem sem dimensões válidas.");
  if (meta.width > MAX_INPUT_DIM || meta.height > MAX_INPUT_DIM) throw new AppError("validation", `A imagem passa de ${MAX_INPUT_DIM}×${MAX_INPUT_DIM} px. Reduza o tamanho e envie de novo.`);

  const hash = sha256(data);
  const db = getDb();
  const [dupe] = await db.select().from(schema.assets).where(and(eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.sha256, hash), eq(schema.assets.kind, "image")));
  if (dupe) return { id: dupe.id, url: `/api/assets/${dupe.id}`, width: dupe.width, height: dupe.height, mime: dupe.mime, deduplicated: true };

  // limite de armazenamento do plano (soma dos bytes dos arquivos da conta)
  await assertUsage(ctx.orgId, "storage", data.length);

  const keepPng = meta.format === "png" && meta.hasAlpha === true;
  let pipeline = sharp(data, { failOn: "error" }).rotate().resize({ width: MAX_OUTPUT_DIM, height: MAX_OUTPUT_DIM, fit: "inside", withoutEnlargement: true });
  pipeline = keepPng ? pipeline.png({ compressionLevel: 9 }) : pipeline.webp({ quality: 86 });
  let out: { data: Buffer; info: OutputInfo };
  try { out = await pipeline.toBuffer({ resolveWithObject: true }); } catch {
    throw new AppError("validation", "Não foi possível processar a imagem. Tente outro arquivo.");
  }
  const id = newId("ast");
  const ext = keepPng ? "png" : "webp";
  const mime = keepPng ? "image/png" : "image/webp";
  const storageKey = `${ctx.orgId}/images/${id}.${ext}`;
  await storage.put(storageKey, out.data, mime);
  await db.insert(schema.assets).values({
    id, orgId: ctx.orgId, kind: "image", storageKey, mime, bytes: out.data.length, width: out.info.width, height: out.info.height,
    sha256: hash, source, sourceNote, originalName: input.originalName?.slice(0, 200) ?? null, createdBy: ctx.userId,
  });
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "asset.upload", entityType: "asset", entityId: id, summary: "Imagem enviada.", data: { source, width: out.info.width, height: out.info.height } });
  return { id, url: `/api/assets/${id}`, width: out.info.width, height: out.info.height, mime, deduplicated: false };
}

/**
 * Bytes de um arquivo. Acesso permitido se:
 * - token assinado válido para este asset (renderização/exportação/vitrine), ou
 * - sessão da mesma conta (ctx).
 */
export async function readAsset(assetId: string, auth: { token?: string | null; ctx?: TenantCtx | null }) {
  let orgId: string | null = null;
  if (auth.token) orgId = verifyAssetToken(auth.token, assetId);
  if (!orgId && auth.ctx) orgId = auth.ctx.orgId;
  if (!orgId) throw new AppError("unauthenticated", "Faça login para continuar.");
  const [a] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, orgId)));
  if (!a) throw notFound("Arquivo");
  const data = await storage.get(a.storageKey).catch(() => { throw notFound("Arquivo"); });
  return { asset: a, data };
}

export function assetSignedUrl(ctx: TenantCtx, assetId: string, ttlSec = 3600) {
  return signedAssetUrl(assetId, ctx.orgId, ttlSec);
}
