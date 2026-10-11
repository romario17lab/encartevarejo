// Modelo "Hortifrúti Fresco" v2 — verde-folha + madeira.
// Cabeçalho em tábuas de madeira com borda de toldo recortado, caixote de frutas vazando do quadro,
// fundo verde com folhas, título 3D com a palavra principal em degradê amarelo→laranja.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function hortiLook(c: Colors): Look {
  const green = strong(c.primary, "#1f8a2e", 0.16);
  const lime = pop(c.secondary, "#a5e04a");
  const orange = pop(c.accent, "#ff8a00");
  const ink = "#132a12";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "leaves", base: green, light: lighten(green, 0.25), dark: deepen(green, 0.05) },
    header: { ground: { kind: "wood", base: "#8a5326", light: "#b97c40", dark: "#4a2a10" }, edge: "scallop", edgeColor: lime, object: "crate", fg: "#ffffff" },
    title: { face: { family: "Montserrat", weight: 900 }, fill: ["#ffffff", "#eefbe0"], keyFill: ["#ffe14a", orange], stroke: darken(green, 0.25), outer: "#1c0f05", extrude: "#2e1806", depth: 0.08, connectorBg: lime, connectorFg: ink },
    ribbon: { bg: green, fg: "#ffffff", face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: lime, fg: green },
    card: { bg: "#fbfff4", fg: ink, meta: "#3f5a35", radius: 0.07, shadow: "0 3px 0 rgba(0,0,0,.3)", heroBg: "#ffd23f", heroFg: ink, heroLabel: "Fresquinho", heroLabelBg: green, heroLabelFg: "#ffffff" },
    plate: { bg: deepen(green, 0.035), fg: "#ffffff", tabBg: orange, tabFg: "#1b1b1b", oldBg: "#fff3a6", oldFg: ink, strike: "#d10000" },
    burst: { bg: "#d81f2a", fg: "#ffffff", ring: "#ffffff" },
    section: { bg: "#5e3412", fg: "#ffffff" },
    footer: { bg: "#0d1a0c", fg: "#ffffff", accent: lime },
    tag: { label: "Hortifrúti" },
  };
}

export default defineTemplate2({
  id: "hortifruti-fresco",
  version: 2,
  name: "Hortifrúti Fresco",
  description: "Verde-folha e madeira: caixote de frutas no cabeçalho, título 3D e preço por kg em placa verde-escura.",
  segments: ["hortifruti", "supermercado"],
  style: "moderno",
  palette: { primary: "#1f8a2e", secondary: "#a5e04a", accent: "#ff8a00", text: "#132a12", background: "#fbfff4" },
  useBrandColors: false,
  fonts: { display: "Montserrat", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: hortiLook,
});
