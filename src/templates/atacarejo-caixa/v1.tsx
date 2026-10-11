// Modelo "Atacarejo Caixa Fechada" v1 — supermercado/atacarejo, estilo econômico.
// Papel kraft, fitas adesivas, letras de estêncil condensadas e preço em etiqueta pendurada.
// Valoriza mecânicas de quantidade (leve 3, a partir de 6 un).
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Stripes } from "../parts/decor";
import { alpha, shade } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  const tape = (x: number, y: number, rot: number) => (
    <div key={`${x}${y}`} style={{ position: "absolute", left: x, top: y, width: S * 0.22, height: S * 0.05, background: alpha("#f6e7b8", 0.85), transform: `rotate(${rot}deg)`, boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
  );
  return (
    <>
      <Stripes x={0} y={0} w={w} h={h} color={alpha(shade(colors.background, 0.3), 0.08)} size={Math.max(4, S * 0.006)} id={`ata-fb-${colors.background.replace("#", "")}`} angle={80} />
      {tape(-S * 0.04, h * 0.002, -14)}
      {tape(w - S * 0.17, h * 0.004, 12)}
    </>
  );
}

export default defineTemplate({
  id: "atacarejo-caixa",
  version: 1,
  name: "Atacarejo Caixa Fechada",
  description: "Papel kraft, fitas e estêncil. Para atacarejo, compras em quantidade, fardos e caixas fechadas.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#1d3557", secondary: "#f4a300", accent: "#c8102e", text: "#1d1d1d", background: "#d8b98a" },
  useBrandColors: true,
  fonts: { display: "Oswald", body: "Inter", price: "Oswald" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ encarte_a4: { preferredItemsPerPage: 15, gap: 8, padding: 8 }, post_feed: { preferredItemsPerPage: 8 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Oswald", weight: 700, upper: true, letterSpacing: 0.02 },
      body: { family: "Inter", weight: 600 },
      name: { family: "Oswald", weight: 600, upper: true },
      price: { family: "Oswald", weight: 700 },
    },
    page: { bg: c.background },
    card: { composition: "stack", bg: "#fffdf6", fg: c.text, meta: "#4a4a4a", border: c.primary, borderWidth: 2, radius: 0.015, photoBg: "#fffdf6", nameAlign: "left", heroBg: "#fffdf6" },
    price: { shape: "tag", bg: c.secondary, fg: c.primary, smallFg: shade(c.primary, 0.2), chipBg: c.primary, chipFg: "#ffffff", strike: c.accent, align: "center" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "tab" },
    hero: { label: "Caixa fechada", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.primary, fg: "#ffffff", style: "bar" },
    header: { variant: "band", bg: c.primary, fg: "#ffffff", accent: c.secondary, accentFg: c.primary },
    footer: { bg: c.primary, fg: "#ffffff", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#fffdf6", fg: c.text, label: "Atacarejo" },
  }),
  Background,
});
