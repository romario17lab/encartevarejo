// Modelo "Empório Gourmet" v3 — preto + dourado editorial sobre verde profundo.
// Preço em SELO ONDULADO dourado; card creme em ARCO (janela) com a foto saindo pelo topo; fundo verde
// com papel e listras douradas finas; título CURSIVA + serifada pesada; folhas douradas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function emporioLook3(c: Colors): Look3 {
  void c;
  const P = SEGMENT_PALETTES.premium;
  const black = P.black, gold = P.gold, green = "#12372a", cream = "#f6efe1";
  return {
    fonts: { name: { family: "Playfair Display", weight: 900, upper: false }, price: { family: "Playfair Display", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 600 } },
    page: ground3(green, lighten(green, 0.12), "#06180f", [
      { kind: "texture", texture: "paper", color: "#000", opacity: 0.5 },
      { kind: "stripes", color: gold, opacity: 0.06, angle: 120, scale: 0.6 },
      { kind: "word", color: gold, opacity: 0.04 },
    ]),
    header: { ground: ground3(black, "#2a2620", "#000000", [{ kind: "texture", texture: "gold", color: "#000", opacity: 1 }], { accents: [gold] }), edge: "arc", edgeColor: gold, object: "wine", fg: "#ffffff" },
    title: { mode: "cursiva", face: { family: "Playfair Display", weight: 900 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: gold, scriptFill: "#ffffff", outline: "#000000", shadow: "#3a2a08", bandBg: gold, bandFg: black, angle: -2 },
    ribbon: { bg: gold, fg: black, face: { family: "Oswald", weight: 600 } },
    logo: { bg: cream, border: gold, fg: black },
    card: { style: "arco", bg: cream, fg: "#1a1612", meta: "#5d5040", accent: green, accentFg: "#ffffff", radius: 0.05, shadow: "#020b06", border: gold, heroBg: "#fbf3df", heroFg: "#1a1612", heroLabel: "Seleção", heroLabelBg: black, heroLabelFg: gold, align: "center" },
    price: { shape: "selo", bg: gold, fg: black, outline: "#fff3c8", shadow: "#000000", sealBg: black, sealFg: gold, tabBg: black, tabFg: gold, oldBg: "#efe4cc", oldFg: black, strike: "#7d1f2c", align: "center" },
    burst: { bg: "#7d1f2c", fg: "#ffffff", ring: gold },
    section: { bg: black, fg: gold },
    footer: { bg: black, fg: "#ffffff", accent: gold, accentFg: black, edge: "reta" },
    hero: "placa",
    deco: [
      { kind: "leaf", at: "ml", size: 0.18, rot: 30, color: "#b88a2c", color2: "#8a6414" },
      { kind: "leaf", at: "mr", size: 0.18, rot: 210, color: "#d4a645", color2: "#8a6414" },
      { kind: "star", at: "br", size: 0.12, rot: 0, color: gold, color2: "#8a6414" },
    ],
    tag: { label: "Empório" },
  };
}

export default defineTemplate3({
  id: "emporio-gourmet",
  version: 3,
  name: "Empório Gourmet",
  description: "Preto, dourado e verde profundo: título cursivo dourado, cards em arco cor creme e preço em selo ondulado dourado.",
  segments: ["supermercado", "padaria"],
  style: "elegante",
  palette: { primary: "#121110", secondary: "#D4A645", accent: "#12372a", text: "#1a1612", background: "#f6efe1" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Playfair Display" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: emporioLook3,
});
