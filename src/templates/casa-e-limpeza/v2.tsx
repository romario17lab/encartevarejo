// Modelo "Casa & Limpeza" v2 — violeta + água + verde-limão.
// Cabeçalho violeta com bolhas de sabão, borrifador e esponja vazando do quadro, título 3D com a
// palavra principal em degradê limão, placa de preço violeta-escura.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function casaLook(c: Colors): Look {
  const violet = strong(c.primary, "#5b2ea6", 0.1);
  const aqua = pop(c.secondary, "#22d3c5");
  const lime = pop(c.accent, "#c6f432");
  const ink = "#1a0b3d";
  return {
    fonts: { name: { family: "Montserrat", weight: 900, upper: true }, price: { family: "Montserrat", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Montserrat", weight: 900 } },
    page: { kind: "bubbles", base: darken(violet, 0.15), light: lighten(violet, 0.15), dark: deepen(violet, 0.02) },
    header: { ground: { kind: "bubbles", base: violet, light: lighten(violet, 0.35), dark: deepen(violet, 0.02) }, edge: "wave", edgeColor: aqua, object: "spray", fg: "#ffffff" },
    title: { face: { family: "Montserrat", weight: 900 }, fill: ["#ffffff", "#efe6ff"], keyFill: ["#e6ff6b", "#36c95a"], stroke: darken(violet, 0.35), outer: "#12052e", extrude: "#2a0e5e", depth: 0.07, connectorBg: aqua, connectorFg: ink },
    ribbon: { bg: aqua, fg: ink, face: { family: "Montserrat", weight: 900 } },
    logo: { bg: "#ffffff", border: aqua, fg: violet },
    card: { bg: "#ffffff", fg: ink, meta: "#4a3d6b", radius: 0.08, shadow: "0 4px 0 rgba(15,0,40,.45)", heroBg: "#ffd23f", heroFg: ink, heroLabel: "Leve mais", heroLabelBg: violet, heroLabelFg: "#ffffff" },
    plate: { bg: ink, fg: "#ffffff", edge: lime, tabBg: aqua, tabFg: ink, oldBg: "#eaffb0", oldFg: ink, strike: "#d10000" },
    burst: { bg: "#ff2f7a", fg: "#ffffff", ring: "#ffffff" },
    section: { bg: aqua, fg: ink },
    footer: { bg: "#120630", fg: "#ffffff", accent: lime },
    tag: { label: "Casa & Limpeza" },
  };
}

export default defineTemplate2({
  id: "casa-e-limpeza",
  version: 2,
  name: "Casa & Limpeza",
  description: "Violeta e água com bolhas de sabão: borrifador no cabeçalho, título 3D verde-limão e preço em placa violeta-escura.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#5b2ea6", secondary: "#22d3c5", accent: "#c6f432", text: "#1a0b3d", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: casaLook,
});
