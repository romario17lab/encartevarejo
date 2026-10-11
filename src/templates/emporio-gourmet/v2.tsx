// Modelo "Empório Gourmet" v2 — elegante preto + dourado.
// Cabeçalho preto com raios finos dourados e brilhos, vinho, taça e queijo vazando do quadro, título
// serifado 3D em marfim com a palavra principal dourada, cards marfim com filete e placa preta com borda dourada.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { lighten, pop, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";
import { luminance } from "../parts/color";

export function emporioLook(c: Colors): Look {
  const black = luminance(c.primary) < 0.04 ? c.primary : "#121110";
  const gold = pop(c.secondary, "#d4af37");
  const wine = "#7d1f2c";
  const ink = "#1a1612";
  return {
    fonts: { name: { family: "Playfair Display", weight: 900, upper: true }, price: { family: "Playfair Display", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 600 } },
    page: { kind: "carbon", base: "#1a1610", light: "#3a3020", dark: "#000000" },
    header: { ground: { kind: "gold", base: black, light: lighten(black, 0.14), dark: "#000000", accents: [gold] }, edge: "arc", edgeColor: gold, object: "wine", fg: "#ffffff" },
    title: { face: { family: "Playfair Display", weight: 900 }, fill: ["#fffaf0", "#efe4cc"], keyFill: ["#fff2b8", "#c4902a"], stroke: "#4a3510", outer: "#000000", extrude: "#2a1e06", depth: 0.06, connectorBg: gold, connectorFg: ink },
    ribbon: { bg: gold, fg: ink, face: { family: "Oswald", weight: 600 } },
    logo: { bg: "#fbf6ea", border: gold, fg: ink },
    card: { bg: "#fbf6ea", fg: ink, meta: "#5a4a30", radius: 0.03, shadow: "0 3px 0 rgba(0,0,0,.6)", border: gold, heroBg: "#e6c66e", heroFg: ink, heroLabel: "Seleção especial", heroLabelBg: ink, heroLabelFg: gold },
    plate: { bg: "#0d0c0a", fg: "#f6e7b8", edge: gold, tabBg: gold, tabFg: ink, oldBg: "#ffffff", oldFg: ink, strike: wine },
    burst: { bg: wine, fg: "#ffffff", ring: gold },
    section: { bg: gold, fg: ink },
    footer: { bg: "#0a0908", fg: "#fbf6ea", accent: gold, edge: gold },
    tag: { label: "Empório" },
  };
}

export default defineTemplate2({
  id: "emporio-gourmet",
  version: 2,
  name: "Empório Gourmet",
  description: "Elegante preto e dourado: vinho e queijos no cabeçalho, título serifado 3D e placas pretas com borda dourada.",
  segments: ["supermercado", "padaria"],
  style: "elegante",
  palette: { primary: "#121110", secondary: "#d4af37", accent: "#7d1f2c", text: "#1a1612", background: "#fbf6ea" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Playfair Display" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: emporioLook,
});
