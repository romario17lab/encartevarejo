// Modelo "Vitrine Clean" v3 — claro e limpo (azul-marinho + coral), mais espaço livre.
// Preço em TICKET coral com recortes laterais; card branco "recorte" com a foto saindo pelo topo;
// fundo claro com quadriculado fino, pontinhos e a palavra da campanha; o fundo continua no cabeçalho.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, type Look3 } from "../parts3/look3";
import { pop, strong } from "../parts2/look";
import type { Colors } from "../parts/types";

export function vitrineLook3(c: Colors): Look3 {
  const navy = strong(c.primary, "#14213d", 0.08);
  const coral = strong(c.accent, "#ef3b2c", 0.2);
  const yellow = pop(c.secondary, "#ffd23f");
  const paper = "#f4f1ec";
  return {
    fonts: { name: { family: "Montserrat", weight: 900, upper: true }, price: { family: "Montserrat", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Montserrat", weight: 900 } },
    page: ground3(paper, "#ffffff", "#e3ddd2", [
      { kind: "grid", color: navy, opacity: 0.05 },
      { kind: "dots", color: coral, opacity: 0.12, scale: 1.4 },
      { kind: "word", color: navy, opacity: 0.035 },
    ]),
    header: { ground: null, edge: "none", edgeColor: coral, object: "bag", fg: navy },
    title: { mode: "faixa", face: { family: "Montserrat", weight: 900 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: navy, keyFill: coral, scriptFill: navy, outline: "#ffffff", shadow: navy, bandBg: navy, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: yellow, fg: navy, face: { family: "Montserrat", weight: 900 } },
    logo: { bg: "#ffffff", border: navy, fg: navy },
    card: { style: "recorte", bg: "#ffffff", fg: navy, meta: "#555b66", accent: coral, accentFg: "#ffffff", radius: 0.07, shadow: "#d6cfc2", border: "#e4ded3", heroBg: "#fff4e8", heroFg: navy, heroLabel: "Destaque", heroLabelBg: coral, heroLabelFg: "#ffffff", align: "left" },
    price: { shape: "ticket", bg: coral, fg: "#ffffff", outline: navy, shadow: navy, sealBg: navy, sealFg: "#ffffff", tabBg: navy, tabFg: "#ffffff", oldBg: yellow, oldFg: navy, strike: "#b00020", align: "right" },
    burst: { bg: navy, fg: "#ffffff", ring: coral },
    section: { bg: navy, fg: "#ffffff" },
    footer: { bg: navy, fg: "#ffffff", accent: yellow, accentFg: navy, edge: "reta" },
    hero: "pedestal",
    deco: [
      { kind: "percent", at: "mr", size: 0.12, rot: 12, color: coral, color2: "#ffffff" },
      { kind: "star", at: "ml", size: 0.1, rot: -10, color: yellow, color2: navy },
    ],
    tag: { label: "Oferta" },
  };
}

export default defineTemplate3({
  id: "vitrine-clean",
  version: 3,
  name: "Vitrine Clean",
  description: "Claro e limpo: fundo papel quadriculado, título marinho e coral com faixa, preço em ticket coral e foto saindo do card.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#14213d", secondary: "#ffd23f", accent: "#ef3b2c", text: "#101522", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: vitrineLook3,
});
