// Modelo "Natal em Família" v1 — sazonal (Natal e fim de ano), estilo elegante.
// Vermelho e verde-pinheiro com dourado, flocos de neve e estrelas desenhados, guirlanda de luzes
// e preço em fita (laço) verde.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Snowflake, Star } from "../parts/decor";
import { alpha } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const S = Math.min(r.w, r.h);
  const n = Math.max(10, Math.round(r.w / (S * 0.18)));
  const bulbs = Array.from({ length: n }, (_, i) => i);
  const sag = S * 0.08;
  const y0 = r.y + r.h - S * 0.14;
  const lightColors = [colors.accent, "#ffffff", colors.secondary];
  return (
    <>
      <Snowflake x={r.w * 0.02} y={S * 0.08} size={S * 0.42} color={alpha("#ffffff", 0.35)} />
      <Snowflake x={r.w - S * 0.5} y={S * 0.02} size={S * 0.3} color={alpha("#ffffff", 0.3)} />
      <Star x={r.w - S * 0.25} y={S * 0.35} size={S * 0.2} color={colors.accent} />
      <Star x={r.w * 0.12} y={S * 0.06} size={S * 0.12} color={colors.accent} opacity={0.9} />
      <svg style={{ position: "absolute", left: 0, top: y0 - sag, width: r.w, height: sag * 3 }} viewBox={`0 0 ${r.w} ${sag * 3}`} aria-hidden="true">
        {bulbs.map((i) => {
          const x = (i + 0.5) * (r.w / n);
          const t = ((i + 0.5) / n) * Math.PI * 4;
          const y = sag + Math.abs(Math.sin(t / 2)) * sag * 0.9;
          return <circle key={i} cx={x} cy={y} r={Math.max(2, S * 0.022)} fill={lightColors[i % 3]} />;
        })}
      </svg>
    </>
  );
}

function Background({ colors, w, h }: DecorProps) {
  const S = Math.min(w, h);
  const flakes: Array<[number, number, number]> = [[0.05, 0.3, 0.07], [0.9, 0.42, 0.09], [0.12, 0.62, 0.05], [0.85, 0.78, 0.06], [0.45, 0.5, 0.04], [0.6, 0.9, 0.05]];
  return (
    <>
      {flakes.map(([x, y, s], i) => <Snowflake key={i} x={x * w} y={y * h} size={S * s} color={alpha(colors.secondary, 0.16)} />)}
    </>
  );
}

export default defineTemplate({
  id: "natal-em-familia",
  version: 1,
  name: "Natal em Família",
  description: "Para Natal e fim de ano: vermelho, verde-pinheiro e dourado, flocos de neve e luzes. Ótimo para ceia e panetones.",
  segments: ["sazonal", "supermercado"],
  style: "elegante",
  palette: { primary: "#a4161a", secondary: "#0b5d45", accent: "#e3b84f", text: "#2b1a12", background: "#fbf4e8" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ encarte_a4: { headerRatio: { first: 0.17, continuation: 0.1 } } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Playfair Display", weight: 900, italic: true },
      body: { family: "Inter", weight: 600 },
      name: { family: "Montserrat", weight: 700 },
      price: { family: "Montserrat", weight: 900 },
    },
    page: { bg: c.background },
    card: { composition: "overlay", bg: "#ffffff", fg: c.text, meta: "#5c4a3e", border: c.accent, borderWidth: 2, radius: 0.07, photoBg: "#ffffff", nameAlign: "left", heroBg: "#ffffff" },
    price: { shape: "ribbon", bg: c.secondary, fg: "#ffffff", smallFg: "#ffffff", chipBg: c.accent, chipFg: c.text, strike: c.accent, align: "center" },
    badge: { bg: c.primary, fg: "#ffffff", shape: "circle" },
    hero: { label: "Para a ceia", bg: c.primary, fg: "#ffffff" },
    section: { bg: c.secondary, fg: "#ffffff", style: "pill" },
    header: { variant: "band", bg: c.primary, fg: "#fff7e6", accent: c.accent, accentFg: c.text },
    footer: { bg: c.secondary, fg: "#ffffff", accent: c.accent, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Natal" },
  }),
  HeaderDecor,
  Background,
});
