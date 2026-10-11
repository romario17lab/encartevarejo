// Modelo "Casa & Limpeza" v1 — varejo (limpeza, higiene, utilidades), estilo moderno.
// Azul e água com espuma de bolhas, brilhos, onda no cabeçalho e cards arredondados.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Bubbles, Star, WaveBand } from "../parts/decor";
import { alpha, tint } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const S = Math.min(r.w, r.h);
  return (
    <>
      <Bubbles x={0} y={0} w={r.w} h={r.h} color="#ffffff" count={16} seed={7} opacity={0.35} />
      <Star x={r.w * 0.08} y={S * 0.15} size={S * 0.16} color="#ffffff" opacity={0.85} />
      <Star x={r.w * 0.9} y={S * 0.5} size={S * 0.12} color={colors.secondary} />
      <WaveBand x={0} y={r.y + r.h - Math.max(10, r.h * 0.16)} w={r.w} h={Math.max(10, r.h * 0.16)} color={colors.secondary} waves={3} depth={0.6} flip />
      <WaveBand x={0} y={r.y + r.h - Math.max(7, r.h * 0.1)} w={r.w} h={Math.max(7, r.h * 0.1)} color={colors.background} waves={4} depth={0.6} flip />
    </>
  );
}

function Background({ colors, w, h }: DecorProps) {
  return <Bubbles x={0} y={h * 0.2} w={w} h={h * 0.8} color={tint(colors.primary, 0.3)} count={18} seed={11} opacity={0.18} />;
}

export default defineTemplate({
  id: "casa-e-limpeza",
  version: 1,
  name: "Casa & Limpeza",
  description: "Azul e água com bolhas e brilhos. Para limpeza, higiene, perfumaria e utilidades do lar.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#0a6fb0", secondary: "#8fdcef", accent: "#ff7a00", text: "#0b2f4a", background: "#eaf6fb" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 14 }, encarte_a4: { gap: 10, padding: 12 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Montserrat", weight: 900, upper: true },
      body: { family: "Inter", weight: 600 },
      name: { family: "Montserrat", weight: 700 },
      price: { family: "Montserrat", weight: 900 },
    },
    page: { bg: c.background },
    card: { composition: "top-name", bg: "#ffffff", fg: c.text, meta: "#45627a", radius: 0.09, shadow: `0 4px 14px ${alpha(c.primary, 0.16)}`, photoBg: tint(c.secondary, 0.8), nameAlign: "center", heroBg: "#ffffff" },
    price: { shape: "band", bg: c.primary, fg: "#ffffff", smallFg: "#ffffff", chipBg: c.accent, chipFg: "#ffffff", strike: c.secondary, align: "center" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "circle" },
    hero: { label: "Destaque", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.primary, fg: "#ffffff", style: "pill" },
    header: { variant: "centered", bg: c.primary, fg: "#ffffff", accent: c.accent, accentFg: "#ffffff" },
    footer: { bg: c.primary, fg: "#ffffff", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Casa & Limpeza" },
  }),
  HeaderDecor,
  Background,
});
