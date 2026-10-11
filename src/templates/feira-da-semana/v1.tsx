// Modelo "Feira da Semana" v1 — supermercado/hortifrúti, estilo popular.
// Vermelho e amarelo de feira, raios de sol no cabeçalho, preço em estouro amarelo
// sobreposto ao canto da foto e faixa xadrez de toalha de feira acima do rodapé.
import { defineTemplate, layoutRules } from "../parts/defineTemplate";
import { Gingham, Sunburst } from "../parts/decor";
import { mix, shade } from "../parts/color";
import type { DecorProps } from "../parts/types";

function HeaderDecor({ page, colors }: DecorProps) {
  const r = page.header;
  return <Sunburst x={r.x} y={r.y} w={r.w} h={r.h} cx={r.w * 0.5} cy={r.h * 1.4} color={shade(colors.primary, 0.12)} rays={30} />;
}

function Background({ page, colors, w }: DecorProps) {
  const f = page.footer;
  const band = Math.max(6, Math.round(f.h * 0.14));
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 30%, ${mix(colors.background, "#ffffff", 0.6)} 0%, ${colors.background} 70%)` }} />
      {f.h > 0 && <Gingham x={0} y={f.y - band} w={w} h={band} color={colors.primary} size={band / 2} />}
    </>
  );
}

export default defineTemplate({
  id: "feira-da-semana",
  version: 1,
  name: "Feira da Semana",
  description: "Clássico de supermercado: vermelho e amarelo, preços em estouro e toalha xadrez de feira.",
  segments: ["supermercado", "hortifruti"],
  style: "popular",
  palette: { primary: "#d62a1e", secondary: "#ffd23f", accent: "#1f7a3a", text: "#1b1b1b", background: "#fff6dc" },
  useBrandColors: true,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules({ encarte_a4: { gap: 9 } }),
  skin: (c) => ({
    fonts: {
      display: { family: "Anton", weight: 400, upper: true, letterSpacing: 0.01 },
      body: { family: "Inter", weight: 600 },
      name: { family: "Inter", weight: 800 },
      price: { family: "Anton", weight: 400 },
    },
    page: { bg: c.background },
    card: { composition: "overlay", bg: "#ffffff", fg: c.text, meta: "#555555", border: c.secondary, borderWidth: 3, radius: 0.06, shadow: "0 2px 0 rgba(0,0,0,0.08)", photoBg: "#ffffff", nameAlign: "left", heroBg: "#ffffff" },
    price: { shape: "burst", bg: c.secondary, fg: c.primary, smallFg: c.text, chipBg: c.primary, chipFg: "#ffffff", strike: c.primary, align: "center" },
    badge: { bg: c.primary, fg: "#ffffff", shape: "circle" },
    hero: { label: "Destaque", bg: c.accent, fg: "#ffffff" },
    section: { bg: c.primary, fg: "#ffffff", style: "bar" },
    header: { variant: "band", bg: c.primary, fg: c.secondary, accent: c.secondary, accentFg: c.primary },
    footer: { bg: c.primary, fg: "#ffffff", accent: c.secondary, style: "bar" },
    tag: { bandBg: c.primary, bandFg: "#ffffff", bg: "#ffffff", fg: c.text, label: "Oferta" },
  }),
  HeaderDecor,
  Background,
});
