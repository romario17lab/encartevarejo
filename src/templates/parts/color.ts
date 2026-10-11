// Utilitários de cor para os modelos. Garantem contraste legível mesmo quando a
// identidade visual da loja substitui a paleta do modelo (useBrandColors).

export interface RGB { r: number; g: number; b: number }

export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const toHex = (c: RGB) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

/** Luminância relativa WCAG 2.x (0..1). */
export function luminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0.5;
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Razão de contraste WCAG entre duas cores (1..21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const INK = "#141414";
export const PAPER = "#ffffff";

/** Escolhe texto claro ou escuro (o de maior contraste) para um fundo. */
export function readableOn(bg: string, light = PAPER, dark = INK): string {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}

/** Mantém a cor desejada se ela tiver contraste suficiente; senão usa claro/escuro. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  return contrast(fg, bg) >= min ? fg : readableOn(bg);
}

/** Mistura duas cores (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  return toHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}

export const shade = (c: string, t: number) => mix(c, "#000000", t);
export const tint = (c: string, t: number) => mix(c, "#ffffff", t);

/** rgba() a partir de uma cor e opacidade. */
export function alpha(color: string, a: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

export const isDark = (c: string) => luminance(c) < 0.22;
