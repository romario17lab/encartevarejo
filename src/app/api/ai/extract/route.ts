import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantRoute } from "@/server/http";
import { readJson, readUpload } from "@/server/route-helpers";
import { AppError } from "@/server/errors";
import { extractList, MAX_AI_FILE_BYTES, MAX_AI_TEXT } from "@/server/services/ai-extract";

export const maxDuration = 120;
const ACCEPTED = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

/**
 * Extração de lista por IA. JSON { text } ou multipart (file = foto JPG/PNG/WebP ou PDF; text = observação opcional).
 * Nada é salvo: devolve as linhas para revisão humana (POST /api/ai/extract/commit salva as confirmadas).
 */
export const POST = tenantRoute(async (req, ctx) => {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const f = await readUpload(req, "file", MAX_AI_FILE_BYTES);
    if (f.type && !ACCEPTED.test(f.type)) throw new AppError("validation", "Formato não aceito. Envie uma foto (JPG, PNG ou WebP) ou um PDF.");
    const r = await extractList(ctx, { file: { data: f.data, name: f.name, type: f.type }, text: f.field("text")?.slice(0, 500) ?? null });
    return NextResponse.json(r);
  }
  const { text } = z.object({ text: z.string().max(MAX_AI_TEXT, `Texto longo demais (máximo ${MAX_AI_TEXT} caracteres).`) }).parse(await readJson(req));
  return extractList(ctx, { text });
}, { permission: "products.write" });
