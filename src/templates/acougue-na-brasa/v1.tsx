// Modelo "Açougue na Brasa" v1 — açougue, estilo popular.
// Fundo carvão com brasas, letras condensadas, cards escuros e preço em lousa (giz) vermelha.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Dots, Stripes } from "../parts/decor";
import { alpha, mix, shade } from "../parts/color";
import type { DecorProps } from "../parts/types";

function Background({ colors, w, h }: DecorProps) {
  return (
    <>
      <Stripes x={0} y={0} w={w} h={h} color={alpha("#ffffff", 0.025)} size={Math.max(10, w * 0.025)} id={`acg-st-${colors.background.replace("#", "")}`} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h * 0.35, background: `radial-gradient(ellipse at 50% 120%, ${alpha(colors.accent, 0.35)} 0%, transparent 65%)` }} />
    </>
  );
}

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  const flame = Math.max(8, r.h * 0.16);
  // borda inferior em chamas estilizadas (triângulos)
  const n = Math.max(8, Math.round(r.w / (flame * 1.2)));
  const step = r.w / n;
  let d = `M0 0H${r.w}V${r.h - flame}`;
  for (let i = n; i > 0; i--) {
    const x1 = i * step, xm = x1 - step / 2, x0 = x1 - step;
    d += `L${xm.toFixed(1)} ${(r.h - (i % 2 ? 0 : flame * 0.35)).toFixed(1)}L${x0.toFixed(1)} ${(r.h - flame).toFixed(1)}`;
  }
  d += "Z";
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0, width: r.w, height: r.h }} viewBox={`0 0 ${r.w} ${r.h}`} aria-hidden="true"><path d={d} fill={colors.primary} /></svg>
      <Dots x={0} y={0} w={r.w} h={r.h - flame} color={colors.secondary} size={Math.max(8, r.h * 0.09)} opacity={0.18} id={`acg-dt-${colors.secondary.replace("#", "")}`} />
    </>
  );
}

export default defineTemplate({
  id: "acougue-na-brasa",
  version: 1,
  name: "Açougue na Brasa",
  description: "Carvão, brasa e vermelho intenso. Para cortes de carne, churrasco e frios com preço por kg bem visível.",
  segments: ["acougue"],
  style: "popular",
  palette: { primary: "#b3141c", secondary: "#ffb627", accent: "#ff5a1f", text: "#f6efe6", background: "#1d1714" },
  useBrandColors: true,
  fonts: { display: "Bebas Neue", body: "Inter", price: "Bebas Neue" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ encarte_a4: { headerRatio: { first: 0.16, continuation: 0.09 } } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Bebas Neue", weight: 400, upper: true, letterSpacing: 0.02 },
      body: { family: "Inter", weight: 600 },
      name: { family: "Oswald", weight: 600, upper: true, letterSpacing: 0.01 },
      price: { family: "Bebas Neue", weight: 400 },
    },
    page: { bg: c.background },
    card: { composition: "stack", bg: mix(c.background, "#ffffff", 0.08), fg: c.text, meta: mix(c.text, c.background, 0.3), border: alpha(c.secondary, 0.55), borderWidth: 1.5, radius: 0.03, photoBg: "#f4ede4", nameAlign: "left", heroBg: mix(c.background, "#ffffff", 0.1) },
    price: { shape: "chalk", bg: c.primary, fg: "#ffffff", smallFg: "#ffffff", chipBg: c.secondary, chipFg: "#1d1714", strike: c.secondary, align: "center" },
    badge: { bg: c.secondary, fg: "#1d1714", shape: "burst" },
    hero: { label: "Corte da semana", bg: c.secondary, fg: "#1d1714" },
    section: { bg: c.secondary, fg: "#1d1714", style: "bar" },
    header: { variant: "split", bg: "transparent", fg: c.secondary, accent: shade(c.background, 0.2), accentFg: "#ffffff" },
    footer: { bg: "#0d0a08", fg: c.text, accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: "#1d1714", label: "Açougue" },
  }),
  HeaderDecor,
  Background,
});
