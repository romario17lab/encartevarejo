// Nome da marca configurável (NEXT_PUBLIC_BRAND_NAME). Use sempre este helper em vez de texto fixo.
export const BRAND_NAME: string = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";

export function brandName(): string {
  return BRAND_NAME;
}

/** Cores-base da marca da plataforma (iguais a src/app/globals.css) para usos fora do CSS (ex.: themeColor, e-mails). */
export const BRAND_COLORS = {
  brand: "#0B6B4F",
  brandStrong: "#085340",
  accent: "#C2410C",
  highlight: "#FFD23F",
  ink: "#16211C",
  paper: "#F6F7F2",
} as const;
