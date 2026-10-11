// Modelo "Vitrine Clean" v2 — coral + azul-marinho, moderno e forte.
// Cabeçalho coral com listras diagonais e corte reto com filete marinho, sacola de compras vazando do
// quadro, tipografia geométrica pesada (Montserrat 900) e placa de preço marinho.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { darken, deepen, lighten, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function vitrineLook(c: Colors): Look {
  const coral = strong(c.accent, strong(c.primary, "#ef3b2c", 0.2), 0.2);
  const navy = strong(c.primary, "#14213d", 0.05);
  const yellow = pop(c.secondary, "#ffd23f");
  const ink = "#101522";
  return {
    fonts: { name: { family: "Montserrat", weight: 900, upper: true }, price: { family: "Montserrat", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Montserrat", weight: 900 } },
    page: { kind: "stripes", base: darken(coral, 0.12), light: lighten(coral, 0.2), dark: deepen(coral, 0.05) },
    header: { ground: { kind: "stripes", base: coral, light: lighten(coral, 0.35), dark: darken(coral, 0.35) }, edge: "straight", edgeColor: navy, object: "bag", fg: "#ffffff" },
    title: { face: { family: "Montserrat", weight: 900 }, fill: ["#ffffff", "#ffe9e4"], keyFill: ["#ffe066", "#ffa000"], stroke: navy, outer: "#05080f", extrude: darken(navy, 0.3), depth: 0.07, connectorBg: navy, connectorFg: "#ffffff" },
    ribbon: { bg: navy, fg: "#ffffff", face: { family: "Montserrat", weight: 900 } },
    logo: { bg: "#ffffff", border: navy, fg: navy },
    card: { bg: "#ffffff", fg: ink, meta: "#4a5160", radius: 0.08, shadow: "0 4px 0 rgba(20,10,10,.35)", heroBg: yellow, heroFg: ink, heroLabel: "Destaque", heroLabelBg: navy, heroLabelFg: "#ffffff" },
    plate: { bg: navy, fg: "#ffffff", tabBg: coral, tabFg: "#ffffff", oldBg: "#ffe9a8", oldFg: ink, strike: "#d10000" },
    burst: { bg: navy, fg: "#ffffff", ring: yellow },
    section: { bg: navy, fg: "#ffffff" },
    footer: { bg: navy, fg: "#ffffff", accent: yellow },
    tag: { label: "Oferta" },
  };
}

export default defineTemplate2({
  id: "vitrine-clean",
  version: 2,
  name: "Vitrine Clean",
  description: "Moderno e forte: coral com listras, tipografia geométrica pesada, sacola de compras e preço em placa marinho.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#14213d", secondary: "#ffd23f", accent: "#ef3b2c", text: "#101522", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: vitrineLook,
});
