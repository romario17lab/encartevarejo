// Modelo "Economia Total" v3 — amarelo + preto (econômico).
// Preço como NÚMERO SOLTO (algarismos com contorno grosso e sombra dura, sem caixa); card em PÍLULA DE DUAS
// CORES (branco em cima, preto embaixo); fundo amarelo com listras de alerta e a palavra da campanha;
// etiquetas voando e moedas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { darken, lighten, pop, strong } from "../parts2/look";
import type { Colors } from "../parts/types";

export function economiaLook3(c: Colors): Look3 {
  const yellow = pop(c.secondary, SEGMENT_PALETTES.promo.yellow);
  const ink = "#121212";
  const head = strong(c.primary, "#141414", 0.12);
  const red = SEGMENT_PALETTES.promo.red;
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(yellow, lighten(yellow, 0.35), darken(yellow, 0.12), [
      { kind: "stripes", color: ink, opacity: 0.07, angle: 45, scale: 1.6 },
      { kind: "word", color: ink, opacity: 0.05 },
    ]),
    header: { ground: ground3(head, lighten(head, 0.18), darken(head, 0.5), [{ kind: "dots", color: yellow, opacity: 0.2 }, { kind: "rays", color: "#ffffff", opacity: 0.06 }]), edge: "zigzag", edgeColor: red, object: "pricetag", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: yellow, scriptFill: "#ffffff", outline: "#000000", shadow: red, bandBg: red, bandFg: "#ffffff", angle: -4 },
    ribbon: { bg: yellow, fg: ink, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: red, fg: ink },
    card: { style: "split", bg: "#ffffff", fg: ink, meta: "#4a4a4a", accent: ink, accentFg: "#ffffff", radius: 0.08, shadow: "#7a5a00", heroBg: "#ffffff", heroFg: ink, heroLabel: "Imperdível", heroLabelBg: red, heroLabelFg: "#ffffff", align: "left" },
    price: { shape: "solto", bg: yellow, fg: ink, outline: "#000000", shadow: red, sealBg: red, sealFg: "#ffffff", tabBg: red, tabFg: "#ffffff", oldBg: "#ffffff", oldFg: ink, strike: "#d10000", align: "right" },
    burst: { bg: red, fg: "#ffffff", ring: yellow },
    section: { bg: ink, fg: yellow },
    footer: { bg: ink, fg: "#ffffff", accent: yellow, accentFg: ink, edge: "diagonal" },
    hero: "placa",
    deco: [
      { kind: "tag", at: "ml", size: 0.16, rot: -18, color: red, color2: "#ffffff" },
      { kind: "coin", at: "mr", size: 0.15, rot: 12, color: "#ffd84d", color2: "#a87200" },
      { kind: "tag", at: "br", size: 0.2, rot: 26, color: ink, color2: yellow },
    ],
    tag: { label: "Economia" },
  };
}

export default defineTemplate3({
  id: "economia-total",
  version: 3,
  name: "Economia Total",
  description: "Amarelo e preto: preço como número solto com contorno e sombra dura, cards em pílula de duas cores e etiquetas voando.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#141414", secondary: "#FFC20E", accent: "#D7192D", text: "#121212", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: economiaLook3,
});
