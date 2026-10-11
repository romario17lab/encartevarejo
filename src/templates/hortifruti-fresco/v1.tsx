// Modelo "Hortifrúti Fresco" v1 — hortifrúti, estilo moderno.
// Verde-folha com onda no cabeçalho, folhas desenhadas, cards arredondados e preço em pílula laranja.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Leaf, WaveBand } from "../parts/decor";
import { alpha, shade, tint } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const S = Math.min(r.w, r.h);
  return (
    <>
      <Leaf x={r.w - S * 0.95} y={-S * 0.12} size={S * 0.8} color={tint(colors.primary, 0.25)} rotate={35} vein={alpha("#ffffff", 0.35)} />
      <Leaf x={r.w - S * 0.5} y={S * 0.15} size={S * 0.55} color={colors.secondary} rotate={-20} vein={alpha(colors.primary, 0.4)} />
      <Leaf x={-S * 0.2} y={S * 0.25} size={S * 0.7} color={shade(colors.primary, 0.15)} rotate={-60} vein={alpha("#ffffff", 0.25)} />
      <WaveBand x={0} y={r.y + r.h - Math.max(8, r.h * 0.14)} w={r.w} h={Math.max(8, r.h * 0.14)} color={colors.background} waves={4} depth={0.55} flip />
    </>
  );
}

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  return (
    <>
      <div style={{ position: "absolute", left: -S * 0.25, bottom: -S * 0.25, width: S * 0.7, height: S * 0.7, borderRadius: "50%", background: alpha(colors.secondary, 0.25) }} />
      <div style={{ position: "absolute", right: -S * 0.2, top: h * 0.45, width: S * 0.5, height: S * 0.5, borderRadius: "50%", background: alpha(colors.accent, 0.1) }} />
    </>
  );
}

export default defineTemplate({
  id: "hortifruti-fresco",
  version: 1,
  name: "Hortifrúti Fresco",
  description: "Verde-folha, onda no topo e cards arredondados. Ideal para frutas, verduras e legumes vendidos por kg.",
  segments: ["hortifruti", "supermercado"],
  style: "moderno",
  palette: { primary: "#2e7d32", secondary: "#a5d65a", accent: "#ef6c00", text: "#173b1c", background: "#f2f8ea" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 12 }, encarte_a4: { gap: 10, padding: 12 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Montserrat", weight: 900, upper: true },
      body: { family: "Inter", weight: 600 },
      name: { family: "Montserrat", weight: 800 },
      price: { family: "Montserrat", weight: 900 },
    },
    page: { bg: c.background },
    card: { composition: "top-name", bg: "#ffffff", fg: c.text, meta: "#4b5b4d", radius: 0.1, shadow: `0 3px 10px ${alpha(c.primary, 0.14)}`, photoBg: tint(c.secondary, 0.82), nameAlign: "center", heroBg: "#ffffff" },
    price: { shape: "pill", bg: c.accent, fg: "#ffffff", smallFg: "#ffffff", chipBg: c.primary, chipFg: "#ffffff", strike: "#ffffff", align: "center" },
    badge: { bg: c.primary, fg: "#ffffff", shape: "tab" },
    hero: { label: "Fresquinho", bg: c.secondary, fg: c.text },
    section: { bg: c.primary, fg: "#ffffff", style: "pill" },
    header: { variant: "centered", bg: c.primary, fg: "#ffffff", accent: c.accent, accentFg: "#ffffff" },
    footer: { bg: shade(c.primary, 0.25), fg: "#ffffff", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Hortifrúti" },
  }),
  HeaderDecor,
  Background,
});
