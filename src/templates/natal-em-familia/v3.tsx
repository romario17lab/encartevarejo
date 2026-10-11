// Modelo "Natal em Família" v3 — kit sazonal "natal" (muda só cabeçalho e cantos; o corpo é neutro).
// Preço em ETIQUETA COM FURO vermelha (etiqueta de presente) com contorno dourado; card creme com MOLDURA
// dourada; fundo verde-pinheiro com neve e listras; título CURSIVA + condensada; bolas e estrela nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, type Look3 } from "../parts3/look3";
import { deepen, lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function natalLook3(c: Colors): Look3 {
  void c;
  const red = "#b3121b", green = "#0e5c34", gold = "#e8b84a", ink = "#2b1a12";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(green, lighten(green, 0.15), deepen(green, 0.02), [
      { kind: "texture", texture: "snow", color: "#fff", opacity: 0.7 },
      { kind: "stripes", color: "#ffffff", opacity: 0.04, angle: 135 },
    ]),
    header: { ground: ground3(red, lighten(red, 0.25), deepen(red, 0.03), [{ kind: "rays", color: "#ffffff", opacity: 0.08, focus: "50% 80%" }, { kind: "texture", texture: "snow", color: "#fff", opacity: 0.8 }]), edge: "snow", edgeColor: gold, fg: "#ffffff" },
    title: { mode: "cursiva", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: gold, scriptFill: "#ffffff", outline: "#3a0408", shadow: "#200204", bandBg: green, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: green, fg: "#ffffff", face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: gold, fg: red },
    card: { style: "moldura", bg: "#fffaf0", fg: ink, meta: "#6b5240", accent: gold, accentFg: ink, radius: 0.05, shadow: "#05301a", heroBg: "#fff3d6", heroFg: ink, heroLabel: "Para a ceia", heroLabelBg: red, heroLabelFg: "#ffffff", align: "left" },
    price: { shape: "etiqueta", bg: red, fg: "#ffffff", outline: gold, shadow: "#3a0408", sealBg: gold, sealFg: ink, tabBg: green, tabFg: "#ffffff", oldBg: "#f6e7c4", oldFg: ink, strike: "#b3121b", align: "right" },
    burst: { bg: gold, fg: ink, ring: red },
    section: { bg: red, fg: "#ffffff" },
    footer: { bg: red, fg: "#ffffff", accent: gold, accentFg: ink, edge: "onda" },
    hero: "pedestal",
    deco: [
      { kind: "ornament", at: "ml", size: 0.14, rot: 8, color: red, color2: gold },
      { kind: "star", at: "mr", size: 0.13, rot: -12, color: gold, color2: "#8a5a00" },
      { kind: "ornament", at: "br", size: 0.18, rot: -10, color: gold, color2: red },
    ],
    kit: "natal",
    tag: { label: "Natal" },
  };
}

export default defineTemplate3({
  id: "natal-em-familia",
  version: 3,
  name: "Natal em Família",
  description: "Kit de Natal: cabeçalho vermelho com neve e enfeites nos cantos, corpo verde neutro, preço em etiqueta de presente.",
  segments: ["sazonal", "supermercado"],
  style: "elegante",
  palette: { primary: "#b3121b", secondary: "#0e5c34", accent: "#e8b84a", text: "#2b1a12", background: "#fffaf0" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: natalLook3,
});
