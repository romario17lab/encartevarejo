// Modelo "Padaria do Forno" v1 — padaria/confeitaria, estilo elegante.
// Creme e marrom de forno, toldo recortado, espigas de trigo, serifada e preço em selo.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Scallop, Wheat } from "../parts/decor";
import { alpha, tint } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const aw = Math.max(10, r.h * 0.2);
  const count = Math.max(8, Math.round(r.w / (aw * 1.4)));
  const S = Math.min(r.w, r.h);
  return (
    <>
      <Scallop x={0} y={0} w={r.w} h={aw} color={colors.primary} count={count} />
      {page.variant !== "continuation" && <Wheat x={r.w * 0.03} y={aw + S * 0.04} w={S * 0.32} h={S * 0.8} color={alpha(colors.secondary, 0.9)} rotate={-18} />}
      <Wheat x={r.w * 0.97 - S * 0.32} y={aw + S * 0.04} w={S * 0.32} h={S * 0.8} color={alpha(colors.secondary, 0.9)} rotate={18} />
    </>
  );
}

function Background({ colors, w, h }: DecorProps) {
  return <div style={{ position: "absolute", inset: Math.min(w, h) * 0.012, border: `${Math.max(1, Math.min(w, h) * 0.003)}px solid ${alpha(colors.primary, 0.35)}`, borderRadius: Math.min(w, h) * 0.02 }} />;
}

export default defineTemplate({
  id: "padaria-do-forno",
  version: 1,
  name: "Padaria do Forno",
  description: "Tons de pão assado, toldo recortado e tipografia serifada. Para padarias, confeitarias e cafés.",
  segments: ["padaria"],
  style: "elegante",
  palette: { primary: "#6f4321", secondary: "#e2a85b", accent: "#8c2f39", text: "#3b2416", background: "#fbf3e3" },
  useBrandColors: true,
  fonts: { display: "Playfair Display", body: "Inter", price: "Playfair Display" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 14 }, encarte_a4: { preferredItemsPerPage: 9, gap: 12, padding: 14, headerRatio: { first: 0.17, continuation: 0.1 } } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Playfair Display", weight: 900, italic: true },
      body: { family: "Inter", weight: 500 },
      name: { family: "Playfair Display", weight: 700 },
      price: { family: "Playfair Display", weight: 900 },
    },
    page: { bg: c.background },
    card: { composition: "top-name", bg: "#fffaf1", fg: c.text, meta: "#6b5444", border: tint(c.secondary, 0.2), borderWidth: 2, radius: 0.04, photoBg: "#fffaf1", nameAlign: "center", heroBg: "#fffaf1" },
    price: { shape: "seal", bg: c.primary, fg: "#fff6e6", smallFg: "#fff6e6", chipBg: c.secondary, chipFg: c.text, strike: c.secondary, align: "center" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "circle" },
    hero: { label: "Saindo do forno", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.primary, fg: c.primary, style: "underline" },
    header: { variant: "centered", bg: "transparent", fg: c.primary, accent: c.accent, accentFg: "#ffffff", insetTop: 0.12 },
    footer: { bg: c.primary, fg: "#fff6e6", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#fff6e6", bg: "#fffaf1", fg: c.text, label: "Padaria" },
  }),
  HeaderDecor,
  Background,
});
