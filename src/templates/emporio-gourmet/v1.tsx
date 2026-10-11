// Modelo "Empório Gourmet" v1 — supermercado/empório, estilo elegante.
// Verde profundo com moldura dourada em linhas finas, serifada e preço tipográfico sem caixa.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import type { CSSProperties } from "react";
import { alpha } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  const m = S * 0.014;
  const line = Math.max(1, S * 0.0022);
  const corner = S * 0.06;
  const c = (style: CSSProperties) => <div style={{ position: "absolute", width: corner, height: corner, borderColor: colors.secondary, borderStyle: "solid", borderWidth: 0, ...style }} />;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${alpha(colors.secondary, 0.16)} 0%, transparent 55%)` }} />
      <div style={{ position: "absolute", inset: m, border: `${line}px solid ${alpha(colors.secondary, 0.8)}` }} />
      <div style={{ position: "absolute", inset: m * 1.7, border: `${line}px solid ${alpha(colors.secondary, 0.4)}` }} />
      {c({ left: m * 2.6, top: m * 2.6, borderLeftWidth: line * 2, borderTopWidth: line * 2 })}
      {c({ right: m * 2.6, top: m * 2.6, borderRightWidth: line * 2, borderTopWidth: line * 2 })}
      {c({ left: m * 2.6, bottom: m * 2.6, borderLeftWidth: line * 2, borderBottomWidth: line * 2 })}
      {c({ right: m * 2.6, bottom: m * 2.6, borderRightWidth: line * 2, borderBottomWidth: line * 2 })}
    </>
  );
}

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const y = r.y + r.h * 0.92;
  return (
    <svg style={{ position: "absolute", left: r.w * 0.3, top: y - 6, width: r.w * 0.4, height: 12 }} viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 6H180M220 6H400" stroke={colors.secondary} strokeWidth="1.5" />
      <path d="M200 0L206 6L200 12L194 6Z" fill={colors.secondary} />
    </svg>
  );
}

export default defineTemplate({
  id: "emporio-gourmet",
  version: 1,
  name: "Empório Gourmet",
  description: "Verde profundo, moldura dourada e serifada clássica. Para empórios, adegas, frios especiais e cestas.",
  segments: ["supermercado", "padaria"],
  style: "elegante",
  palette: { primary: "#173326", secondary: "#c9a75e", accent: "#7d1f2c", text: "#f4eedf", background: "#12261c" },
  useBrandColors: true,
  fonts: { display: "Playfair Display", body: "Inter", price: "Playfair Display" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ all: { gap: 16, padding: 18 }, encarte_a4: { gap: 10, padding: 14 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Playfair Display", weight: 700, italic: true },
      body: { family: "Inter", weight: 500 },
      name: { family: "Playfair Display", weight: 700 },
      price: { family: "Playfair Display", weight: 900 },
    },
    page: { bg: c.background },
    card: { composition: "top-name", bg: "#f8f3e6", fg: "#1f2a22", meta: "#5d5a4c", border: c.secondary, borderWidth: 1.2, radius: 0.015, photoBg: "#f8f3e6", nameAlign: "center", heroBg: "#f8f3e6" },
    price: { shape: "plain", bg: "#f8f3e6", fg: c.primary, smallFg: "#3b3a30", chipBg: c.accent, chipFg: "#ffffff", strike: c.accent, align: "center" },
    badge: { bg: c.accent, fg: "#ffffff", shape: "circle" },
    hero: { label: "Seleção especial", bg: c.primary, fg: c.secondary },
    section: { bg: c.secondary, fg: c.text, style: "underline" },
    header: { variant: "centered", bg: "transparent", fg: c.text, accent: c.secondary, accentFg: "#1f2a22" },
    footer: { bg: c.background, fg: c.text, accent: c.secondary, style: "plain" },
    tag: { bandBg: c.primary, bandFg: c.secondary, bg: "#fbf8f0", fg: "#1f2a22", label: "Empório" },
  }),
  Background,
  HeaderDecor,
});
