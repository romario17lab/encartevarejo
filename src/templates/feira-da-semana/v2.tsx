// Modelo "Feira da Semana" v2 — promoção vermelho + amarelo.
// Cabeçalho vermelho com raios de luz e borda xadrez de feira, título 3D com a palavra principal em
// degradê amarelo→laranja, carrinho de compras vazando do quadro, cards creme e placa de preço preta.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function feiraLook(c: Colors): Look {
  const red = strong(c.primary, "#c8160f", 0.13);
  const yellow = pop(c.secondary, "#ffd400");
  const orange = "#ff8a00";
  const ink = "#141414";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "halftone", base: red, light: lighten(red, 0.22), dark: deepen(red, 0.04) },
    header: { ground: { kind: "rays", base: red, light: lighten(red, 0.35), dark: darken(red, 0.55) }, edge: "gingham", edgeColor: darken(red, 0.1), object: "cart", fg: "#ffffff" },
    title: { face: { family: "Anton", weight: 400 }, fill: ["#ffffff", "#ffe9e0"], keyFill: [yellow, orange], stroke: darken(red, 0.2), outer: "#2a0303", extrude: "#4a0505", depth: 0.09, connectorBg: yellow, connectorFg: ink },
    ribbon: { bg: ink, fg: yellow, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: yellow, fg: red },
    card: { bg: "#fff6e8", fg: ink, meta: "#5a4a3a", radius: 0.045, shadow: "0 3px 0 rgba(0,0,0,.35)", heroBg: "#ffc400", heroFg: ink, heroLabel: "Destaque", heroLabelBg: red, heroLabelFg: "#ffffff" },
    plate: { bg: ink, fg: "#ffffff", tabBg: red, tabFg: "#ffffff", oldBg: yellow, oldFg: ink, strike: "#d10000" },
    burst: { bg: ink, fg: "#ffffff", ring: yellow },
    section: { bg: ink, fg: yellow },
    footer: { bg: "#111111", fg: "#ffffff", accent: yellow },
    tag: { label: "Oferta" },
  };
}

export default defineTemplate2({
  id: "feira-da-semana",
  version: 2,
  name: "Feira da Semana",
  description: "Promoção vermelho e amarelo: raios de luz, título 3D, carrinho cheio e placa de preço preta gigante.",
  segments: ["supermercado", "hortifruti"],
  style: "popular",
  palette: { primary: "#d0140c", secondary: "#ffd400", accent: "#ff8a00", text: "#141414", background: "#fff6e8" },
  useBrandColors: true,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: feiraLook,
});
