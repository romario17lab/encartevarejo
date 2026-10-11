// Dev: imprime as razões de contraste dos tokens da plataforma (docs/03-design.md §1.2).
import { contrast } from "../parts/color";
const pairs: Array<[string, string, string]> = [
  ["branco/brand", "#ffffff", "#0b6b4f"], ["branco/brand-strong", "#ffffff", "#085340"], ["branco/accent", "#ffffff", "#c2410c"],
  ["ink/branco", "#16211c", "#ffffff"], ["ink/surface-alt", "#16211c", "#f6f7f2"], ["ink-muted/branco", "#4f5b55", "#ffffff"],
  ["ink-muted/surface-alt", "#4f5b55", "#f6f7f2"], ["brand-strong/brand-soft", "#085340", "#dff3ea"], ["success/branco", "#15803d", "#ffffff"],
  ["warning/branco", "#a15c07", "#ffffff"], ["danger/branco", "#c62828", "#ffffff"], ["ink/highlight", "#16211c", "#ffd23f"],
  ["accent/surface-alt", "#c2410c", "#f6f7f2"], ["line-strong/branco", "#7a857f", "#ffffff"], ["line/branco", "#dfe3da", "#ffffff"],
];
for (const [n, a, b] of pairs) console.log(n.padEnd(26), contrast(a, b).toFixed(2));
