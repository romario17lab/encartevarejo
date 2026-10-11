// Modelo "Casa & Limpeza" v3 — violeta + água (limpeza).
// Preço em CÍRCULO COM BORDA violeta; card em PÍLULA DE DUAS CORES (branco + água) com a foto saindo pelo
// topo; fundo violeta com ondas e bolhas; título em faixa; bolhas e gotas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, type Look3 } from "../parts3/look3";
import { darken, deepen, lighten, pop, strong } from "../parts2/look";
import type { Colors } from "../parts/types";

export function casaLook3(c: Colors): Look3 {
  const violet = strong(c.primary, "#5b2ea6", 0.12);
  const aqua = pop(c.secondary, "#22d3c5");
  const lime = "#c6f432", ink = "#1a0b3d";
  return {
    fonts: { name: { family: "Montserrat", weight: 900, upper: true }, price: { family: "Montserrat", weight: 900 }, body: { family: "Inter", weight: 800 }, label: { family: "Montserrat", weight: 900 } },
    page: ground3(violet, lighten(violet, 0.2), deepen(violet, 0.03), [
      { kind: "waves", color: "#ffffff", opacity: 0.08 },
      { kind: "texture", texture: "bubbles", color: "#fff", opacity: 0.5 },
    ]),
    header: { ground: ground3(aqua, lighten(aqua, 0.35), darken(aqua, 0.35), [{ kind: "rays", color: "#ffffff", opacity: 0.18, focus: "50% 80%" }, { kind: "dots", color: "#ffffff", opacity: 0.18 }]), edge: "wave", edgeColor: violet, object: "spray", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Montserrat", weight: 900 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: lime, scriptFill: "#ffffff", outline: ink, shadow: ink, bandBg: violet, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: lime, fg: ink, face: { family: "Montserrat", weight: 900 } },
    logo: { bg: "#ffffff", border: violet, fg: violet },
    card: { style: "split", bg: "#ffffff", fg: ink, meta: "#4b3a75", accent: "#d2f6f2", accentFg: ink, radius: 0.08, shadow: deepen(violet, 0.02), heroBg: "#ffffff", heroFg: ink, heroLabel: "Brilho total", heroLabelBg: violet, heroLabelFg: "#ffffff", align: "left" },
    price: { shape: "circulo", bg: violet, fg: "#ffffff", outline: lime, shadow: ink, sealBg: lime, sealFg: ink, tabBg: ink, tabFg: lime, oldBg: "#ffffff", oldFg: ink, strike: "#d10000", align: "right" },
    burst: { bg: lime, fg: ink, ring: violet },
    section: { bg: ink, fg: lime },
    footer: { bg: ink, fg: "#ffffff", accent: aqua, accentFg: ink, edge: "onda" },
    hero: "pedestal",
    deco: [
      { kind: "bubble", at: "ml", size: 0.18, color: "#bdf3ff", color2: "#ffffff" },
      { kind: "drop", at: "mr", size: 0.14, rot: 14, color: aqua, color2: "#ffffff" },
      { kind: "bubble", at: "br", size: 0.24, color: "#d8c8ff", color2: "#ffffff" },
    ],
    tag: { label: "Limpeza" },
  };
}

export default defineTemplate3({
  id: "casa-e-limpeza",
  version: 3,
  name: "Casa & Limpeza",
  description: "Violeta e água com ondas e bolhas: cards em pílula de duas cores, preço em círculo com borda e título com faixa.",
  segments: ["varejo", "supermercado"],
  style: "moderno",
  palette: { primary: "#5b2ea6", secondary: "#22d3c5", accent: "#c6f432", text: "#1a0b3d", background: "#ffffff" },
  useBrandColors: true,
  fonts: { display: "Montserrat", body: "Inter", price: "Montserrat" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: casaLook3,
});
