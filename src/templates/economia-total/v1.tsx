// Modelo "Economia Total" v1 — supermercado/varejo, estilo econômico.
// Amarelo e preto de alto contraste, meio-tom, cards com sombra sólida deslocada,
// faixa de preço preta e grade mais densa (mais produtos por página).
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Dots, Stripes } from "../parts/decor";
import { alpha } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h, page }: DecorProps) {
  const r = page.header;
  return (
    <>
      <Dots x={0} y={0} w={w} h={h} color={colors.secondary} size={Math.max(9, w * 0.016)} opacity={0.09} id={`eco-dt-${colors.secondary.replace("#", "")}`} />
      {r.h > 0 && <Stripes x={0} y={0} w={w} h={Math.max(6, r.h * 0.1)} color={colors.secondary} size={Math.max(12, r.h * 0.16)} id={`eco-st-${colors.secondary.replace("#", "")}`} angle={-45} />}
    </>
  );
}

export default defineTemplate({
  id: "economia-total",
  version: 1,
  name: "Economia Total",
  description: "Amarelo e preto de alto contraste, grade densa e preço em faixa preta. Para encartes com muitos itens.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#ffd400", secondary: "#111111", accent: "#e10600", text: "#111111", background: "#ffd400" },
  useBrandColors: true,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ encarte_a4: { preferredItemsPerPage: 16, gap: 7, padding: 6, headerRatio: { first: 0.13, continuation: 0.08 }, footerRatio: 0.07 }, post_feed: { preferredItemsPerPage: 8 }, tv_horizontal: { preferredItemsPerPage: 8 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Anton", weight: 400, upper: true },
      body: { family: "Inter", weight: 600 },
      name: { family: "Inter", weight: 800 },
      price: { family: "Anton", weight: 400 },
    },
    page: { bg: c.background },
    card: { composition: "stack", bg: "#ffffff", fg: c.text, meta: "#444444", border: c.secondary, borderWidth: 2.2, radius: 0, shadow: `4px 4px 0 ${c.secondary}`, photoBg: "#ffffff", nameAlign: "left", heroBg: "#ffffff" },
    price: { shape: "band", bg: c.secondary, fg: c.primary, smallFg: "#ffffff", chipBg: c.accent, chipFg: "#ffffff", strike: c.accent, align: "right" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "tab" },
    hero: { label: "Destaque", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.secondary, fg: c.primary, style: "bar" },
    header: { variant: "minimal", bg: "transparent", fg: c.secondary, accent: c.secondary, accentFg: c.primary },
    footer: { bg: c.secondary, fg: "#ffffff", accent: c.primary, style: "bar" },
    tag: { bandBg: c.secondary, bandFg: c.primary, bg: "#ffffff", fg: c.text, label: "Economia" },
  }),
  Background,
});
