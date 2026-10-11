// Modelo "Gelada na Hora" v1 — bebidas, estilo moderno.
// Azul profundo em degradê, bolhas e cubos de gelo, letras condensadas e preço em faixa amarela.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Bubbles } from "../parts/decor";
import { alpha, mix, shade, tint } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  const cube = (x: number, y: number, s: number, rot: number) => (
    <div key={`${x}-${y}`} style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: s * 0.18, background: alpha("#ffffff", 0.1), border: `${Math.max(1, s * 0.04)}px solid ${alpha(colors.secondary, 0.45)}`, transform: `rotate(${rot}deg)` }} />
  );
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${colors.primary} 0%, ${colors.background} 70%)` }} />
      <div style={{ position: "absolute", left: -w * 0.2, top: h * 0.1, width: w * 1.4, height: S * 0.18, background: alpha(colors.secondary, 0.12), transform: "rotate(-12deg)" }} />
      <Bubbles x={0} y={0} w={w} h={h} color={colors.secondary} count={22} seed={3} opacity={0.35} />
      {cube(w - S * 0.2, h * 0.02, S * 0.13, 18)}
      {cube(w - S * 0.33, h * 0.07, S * 0.08, -12)}
      {cube(S * 0.02, h - S * 0.32, S * 0.1, 24)}
    </>
  );
}

export default defineTemplate({
  id: "gelada-na-hora",
  version: 1,
  name: "Gelada na Hora",
  description: "Azul gelado com bolhas e cubos de gelo. Para bebidas, cervejas, refrigerantes e sucos.",
  segments: ["bebidas"],
  style: "moderno",
  palette: { primary: "#0d47a1", secondary: "#2ec5e8", accent: "#ffd60a", text: "#0b1f44", background: "#061a40" },
  useBrandColors: true,
  fonts: { display: "Oswald", body: "Inter", price: "Oswald" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 14 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Oswald", weight: 700, upper: true },
      body: { family: "Inter", weight: 600 },
      name: { family: "Oswald", weight: 600, upper: true },
      price: { family: "Oswald", weight: 700 },
    },
    page: { bg: c.background },
    card: { composition: "stack", bg: "#ffffff", fg: c.text, meta: "#4a5a75", radius: 0.07, shadow: `0 6px 18px ${alpha("#000000", 0.25)}`, photoBg: `linear-gradient(180deg, ${tint(c.secondary, 0.85)} 0%, #ffffff 100%)`, nameAlign: "left", heroBg: "#ffffff" },
    price: { shape: "band", bg: c.accent, fg: shade(c.primary, 0.2), smallFg: shade(c.primary, 0.35), chipBg: c.primary, chipFg: "#ffffff", strike: "#c1121f", align: "left" },
    badge: { bg: c.secondary, fg: shade(c.primary, 0.4), shape: "tab" },
    hero: { label: "Trincando", bg: c.secondary, fg: shade(c.primary, 0.4) },
    section: { bg: c.secondary, fg: shade(c.primary, 0.4), style: "pill" },
    header: { variant: "split", bg: "transparent", fg: "#ffffff", accent: c.accent, accentFg: shade(c.primary, 0.3) },
    footer: { bg: mix(c.background, "#000000", 0.35), fg: "#ffffff", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Gelada" },
  }),
  Background,
});
