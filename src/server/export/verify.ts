// Verificação real dos arquivos gerados (dimensões, páginas) antes de entregar ao usuário.
import sharp from "sharp";

export interface RasterInfo { widthPx: number; heightPx: number; format: string }
export interface PdfInfo { pages: number; widthMm: number; heightMm: number; widthPt: number; heightPt: number }

export async function inspectRaster(buf: Buffer): Promise<RasterInfo> {
  const m = await sharp(buf).metadata();
  if (!m.width || !m.height || !m.format) throw new Error("imagem gerada inválida");
  return { widthPx: m.width, heightPx: m.height, format: m.format };
}

/** Leitura mínima do PDF: conta objetos /Type /Page e lê o primeiro MediaBox. */
export function inspectPdf(buf: Buffer): PdfInfo {
  const head = buf.subarray(0, 5).toString("latin1");
  if (head !== "%PDF-") throw new Error("arquivo PDF inválido");
  const text = buf.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const mb = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
  if (!mb) throw new Error("PDF sem MediaBox");
  const widthPt = Number(mb[3]) - Number(mb[1]);
  const heightPt = Number(mb[4]) - Number(mb[2]);
  const toMm = (pt: number) => Math.round((pt * 25.4 / 72) * 10) / 10;
  return { pages, widthPt, heightPt, widthMm: toMm(widthPt), heightMm: toMm(heightPt) };
}
