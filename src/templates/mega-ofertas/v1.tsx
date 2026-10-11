// Modelo "Mega Ofertas" v1 — sazonal (datas comemorativas, semanas de desconto, saldão),
// estilo popular. Não depende de data fixa: o título vem da campanha.
// Preto com amarelo-neon e magenta, raios e listras diagonais, preço em estouro.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Bolt, Stripes } from "../parts/decor";
import { alpha } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const S = Math.min(r.w, r.h);
  return (
    <>
      <Stripes x={0} y={0} w={r.w} h={r.h} color={alpha(colors.accent, 0.22)} size={Math.max(14, S * 0.22)} id={`mega-st-${colors.accent.replace("#", "")}`} angle={-35} />
      <Bolt x={r.w * 0.6} y={S * 0.06} w={S * 0.42} h={S * 0.85} color={colors.secondary} opacity={0.95} />
    </>
  );
}

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 15% 60%, ${alpha(colors.accent, 0.18)} 0%, transparent 40%), radial-gradient(circle at 90% 85%, ${alpha(colors.secondary, 0.12)} 0%, transparent 35%)` }} />
      <Bolt x={w - S * 0.08} y={h * 0.55} w={S * 0.07} h={S * 0.14} color={alpha(colors.secondary, 0.5)} />
      <Bolt x={S * 0.01} y={h * 0.32} w={S * 0.06} h={S * 0.12} color={alpha(colors.accent, 0.6)} />
    </>
  );
}

export default defineTemplate({
  id: "mega-ofertas",
  version: 1,
  name: "Mega Ofertas",
  description: "Preto, amarelo-neon e magenta. Para semanas de desconto, saldões, aniversário da loja e outras datas comemorativas.",
  segments: ["sazonal", "varejo", "supermercado"],
  style: "popular",
  palette: { primary: "#111111", secondary: "#ffe500", accent: "#ff2d87", text: "#ffffff", background: "#0b0b0b" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 12 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Anton", weight: 400, upper: true, letterSpacing: 0.01 },
      body: { family: "Inter", weight: 700 },
      name: { family: "Inter", weight: 800 },
      price: { family: "Anton", weight: 400 },
    },
    page: { bg: c.background },
    card: { composition: "overlay", bg: "#1b1b1b", fg: "#ffffff", meta: "#cfcfcf", border: alpha(c.secondary, 0.7), borderWidth: 1.5, radius: 0.04, photoBg: "#ffffff", nameAlign: "left", heroBg: "#1b1b1b" },
    price: { shape: "burst", bg: c.secondary, fg: "#111111", smallFg: "#111111", chipBg: c.accent, chipFg: "#ffffff", strike: c.accent, align: "center" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "burst" },
    hero: { label: "Mega destaque", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.accent, fg: "#ffffff", style: "bar" },
    header: { variant: "split", bg: c.primary, fg: c.secondary, accent: c.accent, accentFg: "#ffffff" },
    footer: { bg: c.secondary, fg: "#111111", accent: "#111111", style: "bar" },
    tag: { bandBg: "#111111", bandFg: c.secondary, bg: "#ffffff", fg: "#111111", label: "Mega oferta" },
  }),
  HeaderDecor,
  Background,
});
