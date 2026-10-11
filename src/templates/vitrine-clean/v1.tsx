// Modelo "Vitrine Clean" v1 — varejo/supermercado, estilo moderno.
// Branco, tipografia geométrica, muito respiro, preço tipográfico em coral e círculo vazado no topo.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { alpha } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h, page }: DecorProps) {
  const S = Math.min(w, h);
  const r = page.header;
  return (
    <>
      <div style={{ position: "absolute", left: -S * 0.32, bottom: -S * 0.3, width: S * 0.62, height: S * 0.62, borderRadius: "50%", border: `${Math.max(2, S * 0.05)}px solid ${alpha(colors.accent, 0.9)}` }} />
      <div style={{ position: "absolute", left: S * 0.018, top: Math.max(4, r.h * 0.12), width: S * 0.03, height: S * 0.03, borderRadius: "50%", background: colors.primary }} />
    </>
  );
}

export default defineTemplate({
  id: "vitrine-clean",
  version: 1,
  name: "Vitrine Clean",
  description: "Minimalista: fundo branco, cards cinza-claro e preço tipográfico. Bom para lojas que querem visual de marca.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#16181d", secondary: "#f2f2ef", accent: "#e8431f", text: "#16181d", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 16 }, encarte_a4: { gap: 12, padding: 12 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Montserrat", weight: 800, letterSpacing: -0.01 },
      body: { family: "Inter", weight: 500 },
      name: { family: "Inter", weight: 700 },
      price: { family: "Montserrat", weight: 800 },
    },
    page: { bg: c.background },
    card: { composition: "stack", bg: c.secondary, fg: c.text, meta: "#5b5f68", radius: 0.05, photoBg: c.secondary, nameAlign: "left", heroBg: c.secondary },
    price: { shape: "plain", bg: c.secondary, fg: c.accent, smallFg: c.text, chipBg: c.primary, chipFg: "#ffffff", strike: c.accent, align: "left" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "tab" },
    hero: { label: "Em destaque", bg: c.primary, fg: "#ffffff" },
    section: { bg: c.accent, fg: c.text, style: "underline" },
    header: { variant: "minimal", bg: "transparent", fg: c.primary, accent: c.accent, accentFg: "#ffffff" },
    footer: { bg: c.primary, fg: "#ffffff", accent: c.accent, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Oferta" },
  }),
  Background,
});
