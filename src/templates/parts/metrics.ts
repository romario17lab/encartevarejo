// Larguras médias (em em) medidas no Chromium com as fontes de src/render/fonts.css
// (script: src/templates/__dev__/measure-fonts.ts), usando o peso mais pesado de cada família.
// Usadas para estimar quebras de linha e o tamanho do preço SEM medir o DOM, de forma
// determinística (prévia e exportação produzem o mesmo resultado). Margem de segurança aplicada.

export interface FontMetrics { digit: number; avg: number; upAvg: number; currency: number; comma: number }

export const FONT_METRICS: Record<string, FontMetrics> = {
  Inter: { digit: 0.711, avg: 0.529, upAvg: 0.634, currency: 1.334, comma: 0.373 },
  Montserrat: { digit: 0.712, avg: 0.579, upAvg: 0.682, currency: 1.402, comma: 0.304 },
  Oswald: { digit: 0.55, avg: 0.431, upAvg: 0.496, currency: 1.085, comma: 0.238 },
  Anton: { digit: 0.494, avg: 0.432, upAvg: 0.437, currency: 0.938, comma: 0.236 },
  "Bebas Neue": { digit: 0.4, avg: 0.355, upAvg: 0.355, currency: 0.803, comma: 0.188 },
  "Playfair Display": { digit: 0.675, avg: 0.49, upAvg: 0.645, currency: 1.329, comma: 0.278 },
};

export function metricsOf(family: string): FontMetrics {
  return FONT_METRICS[family] ?? FONT_METRICS.Inter;
}

/** Pilha CSS completa de uma família (com alternativas do sistema). */
export function fontStack(family: string): string {
  const fallback = family === "Playfair Display" ? "Georgia, serif" : "Arial, Helvetica, sans-serif";
  return `"${family}", ${fallback}`;
}
