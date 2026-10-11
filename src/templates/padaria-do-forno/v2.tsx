// Modelo "Padaria do Forno" v2 — bege + marrom com trigo.
// Cabeçalho marrom com raios quentes, pão e espigas vazando do quadro, fundo caramelo com padrão de trigo,
// título serifado 3D com a palavra principal em degradê dourado, placa de preço marrom-escura.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function padariaLook(c: Colors): Look {
  const brown = strong(c.primary, "#6b3f1d", 0.09);
  const wheat = pop(c.secondary, "#f2c14e");
  const red = strong(c.accent, "#b8322a", 0.2);
  const ink = "#2e1a0c";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Playfair Display", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "wheat", base: "#b06a2a", light: "#d08a44", dark: "#6e3c12", accents: ["#ffe2a0"] },
    header: { ground: { kind: "rays", base: brown, light: lighten(brown, 0.3), dark: deepen(brown, 0.02) }, edge: "wave", edgeColor: wheat, object: "bread", fg: "#ffffff" },
    title: { face: { family: "Playfair Display", weight: 900 }, fill: ["#fffaf0", "#f1dcb4"], keyFill: ["#ffe08a", "#e07b12"], stroke: darken(brown, 0.15), outer: "#1e0e04", extrude: "#3a1d08", depth: 0.08, connectorBg: wheat, connectorFg: ink },
    ribbon: { bg: "#fff1d2", fg: brown, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#fffaf0", border: wheat, fg: brown },
    card: { bg: "#fffaf0", fg: ink, meta: "#6a4a30", radius: 0.06, shadow: "0 3px 0 rgba(60,25,0,.4)", heroBg: wheat, heroFg: ink, heroLabel: "Saindo do forno", heroLabelBg: red, heroLabelFg: "#ffffff" },
    plate: { bg: "#3a2112", fg: "#fff3d6", edge: wheat, tabBg: red, tabFg: "#ffffff", oldBg: "#ffe8b0", oldFg: ink, strike: "#c40000" },
    burst: { bg: red, fg: "#ffffff", ring: "#fff1d2" },
    section: { bg: brown, fg: "#fff1d2" },
    footer: { bg: "#24140a", fg: "#fff7ea", accent: wheat },
    tag: { label: "Padaria" },
  };
}

export default defineTemplate2({
  id: "padaria-do-forno",
  version: 2,
  name: "Padaria do Forno",
  description: "Bege e marrom com trigo: pão no cabeçalho, título serifado 3D dourado e preço em placa de chocolate.",
  segments: ["padaria"],
  style: "elegante",
  palette: { primary: "#6b3f1d", secondary: "#f2c14e", accent: "#b8322a", text: "#2e1a0c", background: "#fffaf0" },
  useBrandColors: false,
  fonts: { display: "Playfair Display", body: "Inter", price: "Playfair Display" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: padariaLook,
});
