import "./zod-pt";
import type { NextRequest } from "next/server";
import { AppError } from "./errors";

/** Corpo JSON da requisição ({} quando vazio). */
export async function readJson(req: NextRequest | Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new AppError("validation", "Corpo da requisição inválido (JSON esperado)."); }
}

/** Lê um arquivo de um formulário multipart. */
export async function readUpload(req: NextRequest | Request, field = "file", maxBytes = 10 * 1024 * 1024) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len && len > maxBytes + 64 * 1024) throw new AppError("validation", `Arquivo grande demais (máximo ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  let form: FormData;
  try { form = await req.formData(); } catch { throw new AppError("validation", "Envie o arquivo como formulário (multipart/form-data)."); }
  const file = form.get(field);
  if (!file || typeof file === "string") throw new AppError("validation", "Nenhum arquivo enviado.");
  if (file.size > maxBytes) throw new AppError("validation", `Arquivo grande demais (máximo ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  const data = Buffer.from(await file.arrayBuffer());
  const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v : null; };
  return { data, name: (file as File).name ?? "arquivo", type: file.type, field: str };
}

export const qp = (req: NextRequest, k: string) => req.nextUrl.searchParams.get(k);
