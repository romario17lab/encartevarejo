// Ajuste de texto determinístico (sem medir o DOM): escolhe o maior tamanho de fonte
// que cabe em N linhas dentro de uma caixa, estimando a quebra de palavras.
import { metricsOf } from "./metrics";

export interface FitOptions {
  family: string;
  upper?: boolean;
  maxFs: number;
  minFs: number;
  maxLines: number;
  lineHeight?: number;
  /** margem de segurança sobre a largura estimada */
  safety?: number;
  letterSpacing?: number; // em
}

export interface FitResult { fontSize: number; lines: number; truncated: boolean; height: number }

/** Quantas linhas o texto ocupa com a fonte dada numa largura (quebra gulosa por palavra). */
export function estimateLines(text: string, width: number, fs: number, o: Pick<FitOptions, "family" | "upper" | "safety" | "letterSpacing">): number {
  const m = metricsOf(o.family);
  const cw = fs * ((o.upper ? m.upAvg : m.avg) + (o.letterSpacing ?? 0)) * (o.safety ?? 1.1);
  const perLine = Math.max(1, Math.floor(width / cw));
  const words = text.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    let len = w.length;
    if (cur === 0) {
      while (len > perLine) { lines++; len -= perLine; } // palavra maior que a linha: quebra
      cur = len;
    } else if (cur + 1 + len <= perLine) {
      cur += 1 + len;
    } else {
      lines++;
      while (len > perLine) { lines++; len -= perLine; }
      cur = len;
    }
  }
  return lines;
}

/** Maior fonte (passos de ~4%) que cabe em maxLines e na altura; senão a mínima com corte. */
/** A maior palavra cabe inteira numa linha? (evita quebrar palavras no meio) */
function longestWordFits(text: string, width: number, fs: number, o: Pick<FitOptions, "family" | "upper" | "safety" | "letterSpacing">): boolean {
  const m = metricsOf(o.family);
  const cw = fs * ((o.upper ? m.upAvg : m.avg) + (o.letterSpacing ?? 0)) * (o.safety ?? 1.1);
  const longest = text.split(/\s+/).reduce((a, w) => Math.max(a, w.length), 0);
  return longest * cw <= width;
}

export function fitText(text: string, width: number, height: number, o: FitOptions): FitResult {
  const lh = o.lineHeight ?? 1.15;
  let fs = Math.max(o.minFs, o.maxFs);
  while (fs > o.minFs) {
    if (!longestWordFits(text, width, fs, o)) { fs *= 0.96; continue; }
    const lines = estimateLines(text, width, fs, o);
    if (lines <= o.maxLines && lines * fs * lh <= height) return { fontSize: round(fs), lines, truncated: false, height: lines * fs * lh };
    fs *= 0.96;
  }
  fs = o.minFs;
  const lines = estimateLines(text, width, fs, o);
  const fitLines = Math.max(1, Math.min(o.maxLines, Math.floor(height / (fs * lh))));
  return { fontSize: round(fs), lines: Math.min(lines, fitLines), truncated: lines > fitLines, height: Math.min(lines, fitLines) * fs * lh };
}

/** Maior fonte para uma única linha na largura (sem quebra). */
export function fitOneLine(text: string, width: number, maxFs: number, o: Pick<FitOptions, "family" | "upper" | "safety" | "letterSpacing"> & { minFs?: number }): number {
  const m = metricsOf(o.family);
  const per = text.length * ((o.upper ? m.upAvg : m.avg) + (o.letterSpacing ?? 0)) * (o.safety ?? 1.1);
  const fs = per > 0 ? width / per : maxFs;
  return round(Math.max(o.minFs ?? 0, Math.min(maxFs, fs)));
}

export const round = (n: number) => Math.round(n * 10) / 10;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
