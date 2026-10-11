// Modelo "Economia Total" v2 — fim de semana azul + amarelo.
// Cabeçalho azul royal com raios e confete, etiqueta com moedas vazando do quadro, título 3D itálico
// com a palavra principal em degradê amarelo→laranja, fundo azul em meio-tom, grade densa.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function economiaLook(c: Colors): Look {
  const blue = strong(c.primary, "#1446c8", 0.1);
  const yellow = pop(c.secondary, "#ffd400");
  const orange = pop(c.accent, "#ff7a00");
  const ink = "#0b1020";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "halftone", base: blue, light: lighten(blue, 0.25), dark: deepen(blue, 0.02) },
    header: { ground: { kind: "confetti", base: blue, light: lighten(blue, 0.35), dark: deepen(blue, 0.02), accents: [yellow, orange, "#ffffff", "#36e0b0"] }, edge: "slant", edgeColor: yellow, object: "pricetag", fg: "#ffffff" },
    title: { face: { family: "Montserrat", weight: 800, italic: true }, fill: ["#ffffff", "#e6eeff"], keyFill: [yellow, orange], stroke: darken(blue, 0.35), outer: "#020c33", extrude: "#061a5e", depth: 0.08, connectorBg: yellow, connectorFg: ink },
    ribbon: { bg: yellow, fg: ink, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: yellow, fg: blue },
    card: { bg: "#ffffff", fg: ink, meta: "#3a4766", radius: 0.05, shadow: "0 3px 0 rgba(0,10,50,.45)", heroBg: yellow, heroFg: ink, heroLabel: "Imperdível", heroLabelBg: blue, heroLabelFg: "#ffffff" },
    plate: { bg: ink, fg: "#ffffff", tabBg: orange, tabFg: ink, oldBg: "#fff4a8", oldFg: ink, strike: "#d10000" },
    burst: { bg: "#e0261b", fg: "#ffffff", ring: yellow },
    section: { bg: yellow, fg: ink },
    footer: { bg: "#070b18", fg: "#ffffff", accent: yellow },
    tag: { label: "Economia" },
  };
}

export default defineTemplate2({
  id: "economia-total",
  version: 2,
  name: "Economia Total",
  description: "Fim de semana azul e amarelo: confete, título 3D itálico, etiqueta com moedas e grade densa de ofertas.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#1446c8", secondary: "#ffd400", accent: "#ff7a00", text: "#0b1020", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2({ encarte_a4: { preferredItemsPerPage: 16 } }),
  look: economiaLook,
});
