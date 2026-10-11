// Modelo "Açougue na Brasa" v2 — vinho + dourado.
// Cabeçalho em fibra escura com chamas e brasas, churrasqueira vazando do quadro, fundo vinho em papel
// amassado, título 3D condensado com a palavra principal dourada, placa de preço preta com filete dourado.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function acougueLook(c: Colors): Look {
  const wine = strong(c.primary, "#7e0f17", 0.08);
  const gold = pop(c.secondary, "#e8b44a");
  const ink = "#1a0a0a";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "paper", base: wine, light: lighten(wine, 0.18), dark: deepen(wine, 0.012) },
    header: { ground: { kind: "flames", base: "#2a0707", light: "#4d0f0f", dark: "#070101", accents: ["#ffe08a", "#ff7a00", "#c81e00"] }, edge: "torn", edgeColor: gold, object: "grill", fg: "#ffffff" },
    title: { face: { family: "Bebas Neue", weight: 400 }, fill: ["#ffffff", "#f3e6d6"], keyFill: ["#fff0b0", "#d9951e"], stroke: darken(wine, 0.1), outer: "#0a0202", extrude: "#3a0607", depth: 0.1, connectorBg: gold, connectorFg: ink },
    ribbon: { bg: gold, fg: ink, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#fff8ee", border: gold, fg: wine },
    card: { bg: "#f8ecdc", fg: ink, meta: "#5a3a2a", radius: 0.035, shadow: "0 3px 0 rgba(0,0,0,.45)", heroBg: gold, heroFg: ink, heroLabel: "Corte especial", heroLabelBg: ink, heroLabelFg: gold },
    plate: { bg: "#140707", fg: "#ffffff", edge: gold, tabBg: gold, tabFg: ink, oldBg: "#ffffff", oldFg: ink, strike: "#c40000" },
    burst: { bg: wine, fg: "#ffffff", ring: gold },
    section: { bg: ink, fg: gold },
    footer: { bg: "#120606", fg: "#ffffff", accent: gold, edge: gold },
    tag: { label: "Açougue" },
  };
}

export default defineTemplate2({
  id: "acougue-na-brasa",
  version: 2,
  name: "Açougue na Brasa",
  description: "Vinho e dourado com chamas e brasas: churrasqueira no cabeçalho e preço por kg em placa preta com filete dourado.",
  segments: ["acougue"],
  style: "popular",
  palette: { primary: "#7e0f17", secondary: "#e8b44a", accent: "#ff7a00", text: "#1a0a0a", background: "#f8ecdc" },
  useBrandColors: false,
  fonts: { display: "Bebas Neue", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: acougueLook,
});
