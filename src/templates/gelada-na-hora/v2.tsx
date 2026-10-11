// Modelo "Gelada na Hora" v2 — ciano + gelo.
// Cabeçalho azul-gelo com cubos e bolhas, balde de garrafas vazando do quadro, título 3D com a
// palavra principal em degradê amarelo→laranja, placa de preço azul-marinho.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function geladaLook(c: Colors): Look {
  const blue = strong(c.primary, "#0a7fc4", 0.2);
  const cyan = pop(c.secondary, "#22d3ee");
  const yellow = pop(c.accent, "#ffd60a");
  const navy = "#06213f";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Oswald", weight: 700 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "bubbles", base: deepen(blue, 0.09), light: lighten(blue, 0.15), dark: deepen(blue, 0.015) },
    header: { ground: { kind: "ice", base: blue, light: lighten(blue, 0.4), dark: deepen(blue, 0.03), accents: ["#bdf3ff"] }, edge: "wave", edgeColor: cyan, object: "bucket", fg: "#ffffff" },
    title: { face: { family: "Anton", weight: 400 }, fill: ["#ffffff", "#dff6ff"], keyFill: ["#fff36b", "#ffb300"], stroke: "#0a3d8f", outer: "#021a40", extrude: "#03285e", depth: 0.09, connectorBg: yellow, connectorFg: navy },
    ribbon: { bg: yellow, fg: navy, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: cyan, fg: darken(blue, 0.3) },
    card: { bg: "#f4fbff", fg: navy, meta: "#2b4a6b", radius: 0.06, shadow: "0 3px 0 rgba(0,20,60,.45)", heroBg: yellow, heroFg: navy, heroLabel: "Trincando", heroLabelBg: navy, heroLabelFg: "#ffffff" },
    plate: { bg: navy, fg: "#ffffff", edge: cyan, tabBg: cyan, tabFg: navy, oldBg: "#fff36b", oldFg: navy, strike: "#d10000" },
    burst: { bg: "#e0261b", fg: "#ffffff", ring: "#ffffff" },
    section: { bg: navy, fg: cyan },
    footer: { bg: "#03142a", fg: "#ffffff", accent: cyan },
    tag: { label: "Gelada" },
  };
}

export default defineTemplate2({
  id: "gelada-na-hora",
  version: 2,
  name: "Gelada na Hora",
  description: "Ciano e gelo: balde de garrafas com gelo no cabeçalho, bolhas e preço em placa azul-marinho.",
  segments: ["bebidas"],
  style: "moderno",
  palette: { primary: "#0a7fc4", secondary: "#22d3ee", accent: "#ffd60a", text: "#06213f", background: "#f4fbff" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Oswald" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: geladaLook,
});
