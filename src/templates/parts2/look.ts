// "Visual" dos modelos v2: todas as decisões de cor, fonte, fundo e ornamento que as peças leem.
import type { Face } from "./measure";
import { contrast, luminance, mix, parseColor, toHex } from "../parts/color";
import type { RenderCtx as RenderCtx1 } from "../parts/types";

export type GroundKind =
  | "rays" | "confetti" | "wood" | "carbon" | "paper" | "ice" | "wheat" | "flames" | "snow" | "kraft" | "gold"
  | "halftone" | "bubbles" | "leaves" | "stripes" | "hazard";

export interface Ground {
  kind: GroundKind;
  /** cor média do fundo (usada para escolher texto claro/escuro) */
  base: string;
  light: string;
  dark: string;
  /** cores de ornamento (confete, chamas, bolhas...) */
  accents?: string[];
}

export type ObjectKind = "cart" | "crate" | "grill" | "bread" | "bucket" | "megaphone" | "gift" | "wine" | "pallet" | "spray" | "bag" | "pricetag";
export type EdgeKind = "wave" | "zigzag" | "arc" | "slant" | "scallop" | "snow" | "gingham" | "torn" | "straight";

export interface TitleStyle {
  face: Face;
  /** preenchimento das palavras comuns [topo, base] */
  fill: [string, string];
  /** preenchimento da palavra principal [topo, base] */
  keyFill: [string, string];
  /** contorno interno, contorno externo e cor do volume (extrusão) */
  stroke: string;
  outer: string;
  extrude: string;
  /** profundidade do volume (fração do tamanho da fonte) */
  depth: number;
  connectorBg: string;
  connectorFg: string;
  /** força a palavra principal (senão: a palavra mais longa) */
  keyWord?: (words: string[]) => number;
}

export interface Look {
  fonts: { name: Face & { upper: boolean }; price: Face; body: Face; label: Face };
  page: Ground;
  header: { ground: Ground; edge: EdgeKind; edgeColor: string; object: ObjectKind; fg: string };
  title: TitleStyle;
  ribbon: { bg: string; fg: string; face: Face };
  logo: { bg: string; border: string; fg: string };
  card: { bg: string; fg: string; meta: string; radius: number; shadow: string; border?: string; heroBg: string; heroFg: string; heroLabel: string; heroLabelBg: string; heroLabelFg: string };
  plate: { bg: string; fg: string; edge?: string; tabBg: string; tabFg: string; oldBg: string; oldFg: string; strike: string };
  burst: { bg: string; fg: string; ring: string };
  section: { bg: string; fg: string };
  footer: { bg: string; fg: string; accent: string; edge?: string };
  tag: { label: string };
}

export interface Ctx2 extends Omit<RenderCtx1, "skin"> { look: Look }

// ------------------------------------------------------------------ cores

/** Escurece a cor até a luminância máxima pedida (fundos sempre saturados/escuros, mesmo com cor de loja clara). */
export function deepen(color: string, maxLum = 0.12): string {
  let c = color;
  for (let i = 0; i < 24 && luminance(c) > maxLum; i++) c = mix(c, "#000000", 0.08);
  return c;
}

/** Saturação HSL (0..1). */
export function saturation(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
}

/** Croma (0..1) e matiz (graus) de uma cor. */
export function chromaHue(color: string): { chroma: number; hue: number } {
  const c = parseColor(color);
  if (!c) return { chroma: 0, hue: 0 };
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0;
  if (d > 0) hue = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { chroma: d, hue: (hue + 360) % 360 };
}

/** Cor de realce vibrante: usa a cor dada se ela for clara e saturada; senão o padrão. */
export function pop(color: string, fallback = "#FFD000"): string {
  return luminance(color) >= 0.3 && chromaHue(color).chroma >= 0.35 ? color : fallback;
}

/** Cor de fundo forte: a cor dada (escurecida se precisar) quando ela tem croma de verdade e não
 *  vira "barro" ao escurecer (amarelos claros); senão o padrão do modelo. Uma cor de loja pálida
 *  nunca apaga o impacto da peça. */
export function strong(color: string, fallback: string, maxLum = 0.16): string {
  const { chroma, hue } = chromaHue(color);
  const muddy = hue >= 35 && hue <= 75 && luminance(color) > maxLum * 1.6;
  return chroma >= 0.3 && !muddy ? deepen(color, maxLum) : fallback;
}

export const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
export const darken = (c: string, t: number) => mix(c, "#000000", t);
export const hexOf = (c: string) => { const p = parseColor(c); return p ? toHex(p) : c; };
export { contrast };

/** Identificador curto e estável a partir de strings (para ids de SVG). */
export function hid(...parts: Array<string | number>): string {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Gerador pseudoaleatório determinístico. */
export function rng(seed: number) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
