// Modelo "Atacarejo Caixa Fechada" v3 — kraft + preto + laranja (econômico, alta densidade).
// Preço em TICKET preto com algarismos amarelos; card com ORELHA laranja (fita) com o nome; fundo kraft
// com listras de alerta e a palavra da campanha; selos de % e moedas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, type Look3 } from "../parts3/look3";
import { darken, lighten, pop, strong } from "../parts2/look";
import type { Colors } from "../parts/types";

export function atacarejoLook3(c: Colors): Look3 {
  const orange = pop(c.secondary, "#f4a300");
  const navy = strong(c.primary, "#1d3557", 0.1);
  const ink = "#151515", yellow = "#ffd400";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Bebas Neue", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3("#c49660", "#dcb07a", "#8e6232", [
      { kind: "texture", texture: "kraft", color: "#000", opacity: 1 },
      { kind: "stripes", color: ink, opacity: 0.05, angle: 45, scale: 2 },
      { kind: "word", color: ink, opacity: 0.05 },
    ], { gradient: "linear" }),
    header: { ground: ground3(navy, lighten(navy, 0.2), darken(navy, 0.5), [{ kind: "stripes", color: orange, opacity: 0.12, angle: -45, scale: 1.8 }, { kind: "dots", color: "#ffffff", opacity: 0.08 }]), edge: "torn", edgeColor: orange, object: "pallet", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Bebas Neue", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: orange, scriptFill: "#ffffff", outline: ink, shadow: "#000000", bandBg: orange, bandFg: ink, angle: -3 },
    ribbon: { bg: ink, fg: orange, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: orange, fg: navy },
    card: { style: "orelha", bg: "#fffaf0", fg: ink, meta: "#5a4a3a", accent: orange, accentFg: ink, radius: 0.03, shadow: "#5a3a16", heroBg: "#fff1c9", heroFg: ink, heroLabel: "Caixa fechada", heroLabelBg: ink, heroLabelFg: orange, align: "left" },
    price: { shape: "ticket", bg: ink, fg: yellow, outline: orange, shadow: "#5a3a16", sealBg: orange, sealFg: ink, tabBg: navy, tabFg: "#ffffff", oldBg: "#ffffff", oldFg: ink, strike: "#c8102e", align: "right" },
    burst: { bg: "#c8102e", fg: "#ffffff", ring: yellow },
    section: { bg: ink, fg: orange },
    footer: { bg: navy, fg: "#ffffff", accent: orange, accentFg: ink, edge: "reta" },
    hero: "placa",
    deco: [
      { kind: "percent", at: "ml", size: 0.14, rot: -12, color: orange, color2: ink },
      { kind: "coin", at: "mr", size: 0.13, rot: 10, color: "#ffd84d", color2: "#a87200" },
    ],
    tag: { label: "Atacado" },
  };
}

export default defineTemplate3({
  id: "atacarejo-caixa",
  version: 3,
  name: "Atacarejo Caixa Fechada",
  description: "Kraft, marinho e laranja: cards com orelha de fita laranja, preço em ticket preto e listras de alerta.",
  segments: ["supermercado", "varejo"],
  style: "economico",
  palette: { primary: "#1d3557", secondary: "#f4a300", accent: "#c8102e", text: "#151515", background: "#fffaf0" },
  useBrandColors: true,
  fonts: { display: "Bebas Neue", body: "Inter", price: "Bebas Neue" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: atacarejoLook3,
});
