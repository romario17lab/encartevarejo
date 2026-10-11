// Modelo "Natal em Família" v2 — vermelho, verde-pinheiro e dourado.
// Cabeçalho vermelho com flocos de neve e borda de neve acumulada, presente e enfeites vazando do
// quadro, título serifado itálico 3D com a palavra principal dourada, fundo verde com neve.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function natalLook(c: Colors): Look {
  const red = strong(c.primary, "#b3121b", 0.12);
  const green = strong(c.secondary, "#0e5c34", 0.08);
  const gold = pop(c.accent, "#e8b84a");
  const ink = "#2b1a12";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "snow", base: green, light: lighten(green, 0.2), dark: deepen(green, 0.015) },
    header: { ground: { kind: "snow", base: red, light: lighten(red, 0.3), dark: deepen(red, 0.02) }, edge: "snow", edgeColor: gold, object: "gift", fg: "#ffffff" },
    title: { face: { family: "Playfair Display", weight: 700, italic: true }, fill: ["#ffffff", "#f6e9e0"], keyFill: ["#fff2b0", "#d99a12"], stroke: darken(red, 0.3), outer: "#2a0204", extrude: "#4a0508", depth: 0.08, connectorBg: gold, connectorFg: ink },
    ribbon: { bg: green, fg: "#ffffff", face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: gold, fg: red },
    card: { bg: "#fffdf8", fg: ink, meta: "#5a3a2a", radius: 0.05, shadow: "0 3px 0 rgba(0,0,0,.4)", heroBg: gold, heroFg: ink, heroLabel: "Para a ceia", heroLabelBg: red, heroLabelFg: "#ffffff" },
    plate: { bg: deepen(red, 0.04), fg: "#ffffff", edge: gold, tabBg: green, tabFg: "#ffffff", oldBg: "#fff2c4", oldFg: ink, strike: "#c40000" },
    burst: { bg: green, fg: "#ffffff", ring: gold },
    section: { bg: red, fg: "#ffffff" },
    footer: { bg: "#160707", fg: "#ffffff", accent: gold, edge: gold },
    tag: { label: "Natal" },
  };
}

export default defineTemplate2({
  id: "natal-em-familia",
  version: 2,
  name: "Natal em Família",
  description: "Natal e fim de ano: vermelho com neve, presente e enfeites no cabeçalho, título dourado 3D e fundo verde-pinheiro.",
  segments: ["sazonal", "supermercado"],
  style: "elegante",
  palette: { primary: "#b3121b", secondary: "#0e5c34", accent: "#e8b84a", text: "#2b1a12", background: "#fffdf8" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: natalLook,
});
