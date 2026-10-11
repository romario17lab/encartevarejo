// Modelo "Padaria do Forno" v3 — editorial bege + marrom.
// Preço em CÍRCULO COM BORDA marrom; card creme com ORELHA marrom com o nome; fundo de papel bege com
// pontinhos e trigo; título CURSIVA + condensada; ramos de trigo cortados pela borda.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { darken, lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function padariaLook3(c: Colors): Look3 {
  void c;
  const P = SEGMENT_PALETTES.editorial;
  const beige = P.beige, brown = P.brown, caramel = P.caramel, ink = "#2e1a0c";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(beige, "#fbf3e3", "#d9c3a0", [
      { kind: "texture", texture: "paper", color: "#000", opacity: 0.55 },
      { kind: "dots", color: caramel, opacity: 0.18 },
      { kind: "word", color: brown, opacity: 0.04 },
    ]),
    header: { ground: ground3(brown, lighten(brown, 0.22), darken(brown, 0.4), [{ kind: "texture", texture: "wheat", color: "#000", opacity: 0.9 }, { kind: "rays", color: "#ffffff", opacity: 0.06 }], { accents: ["#f2c14e"] }), edge: "wave", edgeColor: caramel, object: "bread", fg: "#ffffff" },
    title: { mode: "cursiva", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: "#f6d28b", scriptFill: "#ffffff", outline: "#2a1405", shadow: "#140800", bandBg: caramel, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: "#fff6e4", fg: brown, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#fffaf0", border: caramel, fg: brown },
    card: { style: "orelha", bg: "#fffaf0", fg: ink, meta: "#6b4a2e", accent: brown, accentFg: "#ffffff", radius: 0.06, shadow: "#a07850", heroBg: "#fff3d6", heroFg: ink, heroLabel: "Saiu do forno", heroLabelBg: caramel, heroLabelFg: "#ffffff", align: "left" },
    price: { shape: "circulo", bg: brown, fg: "#fff6e4", outline: "#f2c14e", shadow: "#3b200b", sealBg: "#f2c14e", sealFg: ink, tabBg: caramel, tabFg: "#ffffff", oldBg: "#f2e2c4", oldFg: ink, strike: "#b8322a", align: "right" },
    burst: { bg: "#b8322a", fg: "#ffffff", ring: "#f2c14e" },
    section: { bg: brown, fg: "#fff6e4" },
    footer: { bg: brown, fg: "#ffffff", accent: "#f2c14e", accentFg: ink, edge: "onda" },
    hero: "pedestal",
    deco: [
      { kind: "wheat", at: "ml", size: 0.2, rot: 24, color: "#d9a441", color2: "#a87424" },
      { kind: "wheat", at: "mr", size: 0.2, rot: -24, color: "#d9a441", color2: "#a87424" },
      { kind: "wheat", at: "br", size: 0.26, rot: -40, color: "#c98f34", color2: "#a87424" },
    ],
    tag: { label: "Padaria" },
  };
}

export default defineTemplate3({
  id: "padaria-do-forno",
  version: 3,
  name: "Padaria do Forno",
  description: "Editorial bege e marrom: papel e trigo, título cursivo, cards com orelha marrom e preço em círculo com borda.",
  segments: ["padaria"],
  style: "elegante",
  palette: { primary: "#5A3418", secondary: "#B9752F", accent: "#f2c14e", text: "#2e1a0c", background: "#F3E6CF" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: padariaLook3,
});
