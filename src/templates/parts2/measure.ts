// Medidas de texto determinísticas para os modelos v2 (sem DOM): larguras por caractere medidas
// no Chromium (glyphs-metrics.ts). Prévia e exportação chegam ao mesmo resultado.
import { GLYPHS } from "./glyphs-metrics";

export interface Face { family: string; weight: number; italic?: boolean }

const cache = new Map<string, (typeof GLYPHS)[string]>();
function table(f: Face) {
  const k = `${f.family}|${f.weight}|${f.italic ? "italic" : "normal"}`;
  let t = cache.get(k);
  if (t) return t;
  t = GLYPHS[k]
    ?? Object.entries(GLYPHS).find(([kk]) => kk.startsWith(`${f.family}|`) && kk.endsWith(f.italic ? "italic" : "normal"))?.[1]
    ?? Object.entries(GLYPHS).find(([kk]) => kk.startsWith(`${f.family}|`))?.[1]
    ?? GLYPHS["Inter|800|normal"];
  cache.set(k, t);
  return t;
}

/** Largura (px) de uma linha de texto no tamanho fs. */
export function textWidth(text: string, f: Face, fs: number, letterSpacingEm = 0): number {
  const t = table(f);
  const fallback = t.w["n"] ?? 0.55;
  let em = 0;
  for (const ch of text) em += t.w[ch] ?? (ch.toUpperCase() !== ch ? t.w[ch.toUpperCase()] ?? fallback : fallback);
  return em * fs + Math.max(0, [...text].length - 1) * letterSpacingEm * fs;
}

/** Altura das maiúsculas/algarismos (em). */
export const capOf = (f: Face) => table(f).cap;

/** Maior tamanho em que o texto cabe numa linha de largura w (limitado a [minFs, maxFs]). */
export function fitWidth(text: string, f: Face, w: number, maxFs: number, minFs = 1, letterSpacingEm = 0): number {
  const one = textWidth(text, f, 1, letterSpacingEm);
  const fs = one > 0 ? w / one : maxFs;
  return Math.round(Math.max(minFs, Math.min(maxFs, fs)) * 10) / 10;
}

/** Quebra gulosa em linhas (sem partir palavras) para a largura dada; null se alguma palavra não cabe. */
export function wrap(text: string, f: Face, fs: number, w: number): string[] | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (textWidth(word, f, fs) > w) return null;
    const cand = cur ? `${cur} ${word}` : word;
    if (textWidth(cand, f, fs) <= w) cur = cand;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Maior fonte em que o texto cabe em até maxLines linhas e na altura (passos de 4%). */
export function fitLines(text: string, f: Face, w: number, h: number, o: { maxFs: number; minFs: number; maxLines: number; lineHeight: number }): { fs: number; lines: string[]; truncated: boolean } {
  let fs = o.maxFs;
  while (fs > o.minFs) {
    const lines = wrap(text, f, fs, w);
    if (lines && lines.length <= o.maxLines && lines.length * fs * o.lineHeight <= h) return { fs: r1(fs), lines, truncated: false };
    fs *= 0.96;
  }
  fs = o.minFs;
  const lines = wrap(text, f, fs, w) ?? [text];
  const max = Math.max(1, Math.min(o.maxLines, Math.floor(h / (fs * o.lineHeight))));
  return { fs: r1(fs), lines: lines.slice(0, max), truncated: lines.length > max };
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const fontStack = (family: string) => `"${family}", ${family === "Playfair Display" ? "Georgia, serif" : "Arial, Helvetica, sans-serif"}`;
