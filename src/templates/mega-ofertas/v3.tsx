// Modelo "Mega Ofertas" v3 — preto + amarelo neon + magenta (saldão, aniversário, semanas de desconto).
// Preço em EXPLOSÃO amarela com contorno magenta; card branco com ORELHA magenta com o nome; fundo carbono
// com raios magenta e a palavra da campanha repetida; raios, % e etiquetas voando nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, type Look3 } from "../parts3/look3";
import { lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function megaLook3(c: Colors): Look3 {
  void c;
  const black = "#0b0b0b", yellow = "#ffe500", magenta = "#e5127d", ink = "#111111";
  return {
    fonts: { name: { family: "Inter", weight: 900, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Inter", weight: 900 } },
    page: ground3("#1a1a1a", "#2a2a2a", "#000000", [
      { kind: "texture", texture: "carbon", color: "#000", opacity: 0.9 },
      { kind: "rays", color: magenta, opacity: 0.16 },
      { kind: "word", color: "#ffffff", opacity: 0.05 },
    ]),
    header: { ground: ground3(magenta, lighten(magenta, 0.25), "#3a0020", [{ kind: "rays", color: yellow, opacity: 0.2, focus: "50% 85%" }, { kind: "confetti", color: yellow, opacity: 0.7 }]), edge: "zigzag", edgeColor: yellow, object: "megaphone", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: yellow, scriptFill: "#ffffff", outline: black, shadow: black, bandBg: black, bandFg: yellow, angle: -5 },
    ribbon: { bg: yellow, fg: black, face: { family: "Inter", weight: 900 } },
    logo: { bg: "#ffffff", border: yellow, fg: black },
    card: { style: "orelha", bg: "#ffffff", fg: ink, meta: "#4a4a4a", accent: magenta, accentFg: "#ffffff", radius: 0.06, shadow: magenta, heroBg: "#fff9c2", heroFg: ink, heroLabel: "Mega", heroLabelBg: black, heroLabelFg: yellow, align: "left" },
    price: { shape: "explosao", bg: yellow, fg: ink, outline: magenta, shadow: black, sealBg: black, sealFg: yellow, tabBg: black, tabFg: yellow, oldBg: "#ffd6ea", oldFg: ink, strike: "#d10000", align: "right" },
    burst: { bg: magenta, fg: "#ffffff", ring: yellow },
    section: { bg: yellow, fg: black },
    footer: { bg: black, fg: "#ffffff", accent: yellow, accentFg: black, edge: "diagonal" },
    hero: "placa",
    deco: [
      { kind: "bolt", at: "ml", size: 0.16, rot: -10, color: yellow, color2: black },
      { kind: "percent", at: "mr", size: 0.15, rot: 14, color: magenta, color2: "#ffffff" },
      { kind: "rays", at: "br", size: 0.32, color: "#3a0020", color2: "#1a1a1a" },
    ],
    tag: { label: "Mega" },
  };
}

export default defineTemplate3({
  id: "mega-ofertas",
  version: 3,
  name: "Mega Ofertas",
  description: "Preto, amarelo neon e magenta: preço em explosão, cards com orelha magenta, raios e etiquetas voando.",
  segments: ["sazonal", "varejo", "supermercado"],
  style: "popular",
  palette: { primary: "#0b0b0b", secondary: "#ffe500", accent: "#e5127d", text: "#ffffff", background: "#0b0b0b" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: megaLook3,
});
