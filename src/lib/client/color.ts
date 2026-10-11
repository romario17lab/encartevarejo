// Contraste WCAG entre duas cores hex (#rgb ou #rrggbb).
export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
function lum([r, g, b]: [number, number, number]) {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number | null {
  const x = hexToRgb(a); const y = hexToRgb(b);
  if (!x || !y) return null;
  const [l1, l2] = [lum(x), lum(y)].sort((m, n) => n - m);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const fmtRatio = (r: number) => `${r.toFixed(1).replace(".", ",")}:1`;
