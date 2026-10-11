// Modelo "Feira da Semana" v3 — promoção vermelho #D7192D + amarelo #FFC20E (paleta mais comum do estudo).
// Preço em PLACA preta com contorno amarelo e sombra dura; cards brancos "recorte" com a foto saindo pelo topo;
// fundo vermelho com listras diagonais, raios e a palavra da campanha repetida; selos "%" nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { darken, lighten, pop, strong } from "../parts2/look";
import type { Colors } from "../parts/types";

export function feiraLook3(c: Colors): Look3 {
  const P = SEGMENT_PALETTES.promo;
  const red = strong(c.primary, P.red, 0.16);
  const yellow = pop(c.secondary, P.yellow);
  const ink = P.ink;
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(red, lighten(red, 0.18), darken(red, 0.35), [
      { kind: "stripes", color: "#ffffff", opacity: 0.07, angle: 135 },
      { kind: "word", color: "#ffffff", opacity: 0.06 },
    ]),
    header: {
      ground: ground3(red, lighten(red, 0.3), darken(red, 0.45), [
        { kind: "rays", color: "#ffffff", opacity: 0.16, focus: "50% 75%" },
        { kind: "dots", color: "#ffffff", opacity: 0.12 },
      ]),
      edge: "slant", edgeColor: yellow, fg: "#ffffff",
    },
    title: { mode: "faixa", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: yellow, scriptFill: "#ffffff", outline: ink, shadow: darken(red, 0.6), bandBg: ink, bandFg: "#ffffff", angle: -4 },
    ribbon: { bg: yellow, fg: ink, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: yellow, fg: red },
    card: { style: "recorte", bg: "#ffffff", fg: ink, meta: "#5b5b5b", accent: yellow, accentFg: ink, radius: 0.06, shadow: darken(red, 0.55), heroBg: "#fff3c4", heroFg: ink, heroLabel: "Destaque", heroLabelBg: ink, heroLabelFg: yellow, align: "left" },
    price: { shape: "placa", bg: ink, fg: "#ffffff", outline: yellow, shadow: darken(red, 0.5), sealBg: yellow, sealFg: ink, tabBg: red, tabFg: "#ffffff", oldBg: yellow, oldFg: ink, strike: "#d10000", align: "right" },
    burst: { bg: yellow, fg: ink, ring: ink },
    section: { bg: ink, fg: yellow },
    footer: { bg: ink, fg: "#ffffff", accent: yellow, accentFg: ink, edge: "diagonal" },
    hero: "pedestal",
    deco: [
      { kind: "percent", at: "ml", size: 0.15, rot: -14, color: yellow, color2: ink },
      { kind: "tag", at: "mr", size: 0.16, rot: 20, color: yellow, color2: ink },
      { kind: "rays", at: "br", size: 0.3, color: lighten(red, 0.12), color2: red },
    ],
    tag: { label: "Oferta" },
  };
}

export default defineTemplate3({
  id: "feira-da-semana",
  version: 3,
  name: "Feira da Semana",
  description: "Vermelho e amarelo: título com faixa inclinada, placa de preço preta com contorno amarelo, foto saindo do card e selos de % nos cantos.",
  segments: ["supermercado", "hortifruti"],
  style: "popular",
  palette: { primary: "#D7192D", secondary: "#FFC20E", accent: "#141414", text: "#141414", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: feiraLook3,
});
