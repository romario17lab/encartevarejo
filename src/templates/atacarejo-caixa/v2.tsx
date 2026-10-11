// Modelo "Atacarejo Caixa Fechada" v2 — papelão kraft + preto + amarelo.
// Cabeçalho em papelão com fibras, pallet de caixas vazando do quadro, título condensado 3D,
// fundo kraft escuro, grade densa e placa de preço preta.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { deepen, pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function atacarejoLook(c: Colors): Look {
  const navy = strong(c.primary, "#1d3557", 0.06);
  const amber = pop(c.secondary, "#f4a300");
  const red = strong(c.accent, "#c8102e", 0.2);
  const ink = "#151515";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Bebas Neue", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: { kind: "kraft", base: "#8a5f2e", light: "#a8783f", dark: "#5a3b18" },
    header: { ground: { kind: "kraft", base: "#c49660", light: "#dcb07a", dark: "#8e6232" }, edge: "torn", edgeColor: ink, object: "pallet", fg: "#ffffff" },
    title: { face: { family: "Bebas Neue", weight: 400 }, fill: ["#ffffff", "#f1f1f1"], keyFill: ["#ffd000", "#ff8a00"], stroke: ink, outer: "#000000", extrude: "#3b2a14", depth: 0.1, connectorBg: amber, connectorFg: ink },
    ribbon: { bg: navy, fg: "#ffffff", face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: ink, fg: navy },
    card: { bg: "#ffffff", fg: ink, meta: "#4a4a4a", radius: 0.025, shadow: "0 3px 0 rgba(0,0,0,.45)", heroBg: "#ffc233", heroFg: ink, heroLabel: "Caixa fechada", heroLabelBg: ink, heroLabelFg: amber },
    plate: { bg: ink, fg: "#ffffff", tabBg: red, tabFg: "#ffffff", oldBg: "#ffe27a", oldFg: ink, strike: "#d10000" },
    burst: { bg: red, fg: "#ffffff", ring: ink },
    section: { bg: ink, fg: amber },
    footer: { bg: deepen(navy, 0.02), fg: "#ffffff", accent: amber },
    tag: { label: "Atacado" },
  };
}

export default defineTemplate2({
  id: "atacarejo-caixa",
  version: 2,
  name: "Atacarejo Caixa Fechada",
  description: "Papelão kraft, pallet de caixas e título condensado 3D. Para atacarejo, fardos e compras em quantidade.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#1d3557", secondary: "#f4a300", accent: "#c8102e", text: "#151515", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Bebas Neue", body: "Inter", price: "Bebas Neue" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2({ encarte_a4: { preferredItemsPerPage: 15 } }),
  look: atacarejoLook,
});
