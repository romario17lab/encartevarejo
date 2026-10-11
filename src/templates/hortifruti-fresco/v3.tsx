// Modelo "Hortifrúti Fresco" v3 — verde #1E8F3A + amarelo, cabeçalho de madeira (feira).
// Preço em ETIQUETA COM FURO amarela; card com DISCO verde-claro atrás da foto saindo pelo topo;
// fundo verde com pontinhos, folhas e a palavra da campanha; título CURSIVA + condensada; folhas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { darken, deepen, lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function hortiLook3(c: Colors): Look3 {
  void c;
  const P = SEGMENT_PALETTES.verde;
  const green = P.green, yellow = P.yellow, ink = P.ink;
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(green, lighten(green, 0.2), deepen(green, 0.05), [
      { kind: "dots", color: "#ffffff", opacity: 0.12 },
      { kind: "texture", texture: "leaves", color: "#ffffff", opacity: 0.35 },
      { kind: "word", color: "#ffffff", opacity: 0.05 },
    ]),
    header: { ground: ground3("#8a5326", "#b97c40", "#4a2a10", [{ kind: "texture", texture: "wood", color: "#000", opacity: 1 }], { gradient: "linear" }), edge: "scallop", edgeColor: yellow, object: "crate", fg: "#ffffff" },
    title: { mode: "cursiva", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: yellow, scriptFill: "#ffffff", outline: "#2a1606", shadow: "#1d0e03", bandBg: green, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: green, fg: "#ffffff", face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: yellow, fg: green },
    card: { style: "circulo", bg: "#fbfff2", fg: ink, meta: "#3f5a3a", accent: "#d6f0b8", accentFg: ink, radius: 0.08, shadow: darken(green, 0.55), heroBg: "#fff6cc", heroFg: ink, heroLabel: "Fresquinho", heroLabelBg: green, heroLabelFg: "#ffffff", align: "center" },
    price: { shape: "etiqueta", bg: yellow, fg: ink, outline: darken(green, 0.35), shadow: darken(green, 0.55), sealBg: green, sealFg: "#ffffff", tabBg: green, tabFg: "#ffffff", oldBg: "#ffffff", oldFg: ink, strike: "#c62828", align: "center" },
    burst: { bg: yellow, fg: ink, ring: green },
    section: { bg: "#2a1606", fg: yellow },
    footer: { bg: deepen(green, 0.03), fg: "#ffffff", accent: yellow, accentFg: ink, edge: "onda" },
    hero: "pedestal",
    deco: [
      { kind: "leaf", at: "ml", size: 0.2, rot: 20, color: "#5cbf3a", color2: "#2e7d1f" },
      { kind: "leaf", at: "mr", size: 0.18, rot: 200, color: "#7bd34f", color2: "#2e7d1f" },
      { kind: "leaf", at: "br", size: 0.24, rot: 250, color: "#5cbf3a", color2: "#2e7d1f" },
    ],
    tag: { label: "Fresco" },
  };
}

export default defineTemplate3({
  id: "hortifruti-fresco",
  version: 3,
  name: "Hortifrúti Fresco",
  description: "Verde e amarelo com cabeçalho de madeira, título cursivo, etiqueta de preço com furo e foto saindo de um disco no card.",
  segments: ["hortifruti", "supermercado"],
  style: "moderno",
  palette: { primary: "#1E8F3A", secondary: "#FFC20E", accent: "#8a5326", text: "#10240f", background: "#fbfff2" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: hortiLook3,
});
