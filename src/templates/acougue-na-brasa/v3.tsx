// Modelo "Açougue na Brasa" v3 — premium preto + dourado + madeira (carne).
// Preço em BANDEIRA dourada (ponta recortada); card escuro com MOLDURA dourada dupla e foto saindo pelo topo;
// fundo de madeira escura com a palavra da campanha; título em faixa vinho; chamas e raios nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import {  } from "../parts2/look";
import type { Colors } from "../parts/types";

export function acougueLook3(c: Colors): Look3 {
  void c;
  const P = SEGMENT_PALETTES.premium;
  const black = P.black, gold = P.gold, wine = "#7e0f17";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3("#3a2416", "#5a3820", "#170d07", [
      { kind: "texture", texture: "wood", color: "#000", opacity: 0.9 },
      { kind: "word", color: "#000000", opacity: 0.18 },
    ], { gradient: "linear" }),
    header: { ground: ground3(black, "#2c2420", "#000000", [{ kind: "texture", texture: "carbon", color: "#000", opacity: 0.8 }, { kind: "rays", color: gold, opacity: 0.12, focus: "50% 80%" }]), edge: "torn", edgeColor: gold, object: "grill", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: gold, scriptFill: gold, outline: "#000000", shadow: wine, bandBg: wine, bandFg: "#ffffff", angle: -3 },
    ribbon: { bg: gold, fg: black, face: { family: "Oswald", weight: 700 } },
    logo: { bg: black, border: gold, fg: gold },
    card: { style: "moldura", bg: "#1d1714", fg: "#ffffff", meta: "#d8c6a8", accent: gold, accentFg: black, radius: 0.04, shadow: "#000000", heroBg: "#2a1c14", heroFg: "#ffffff", heroLabel: "Especial", heroLabelBg: gold, heroLabelFg: black, align: "left" },
    price: { shape: "bandeira", bg: gold, fg: black, outline: "#fff3d0", shadow: "#000000", sealBg: wine, sealFg: "#ffffff", tabBg: wine, tabFg: "#ffffff", oldBg: "#fff3d0", oldFg: black, strike: "#c62828", align: "right" },
    burst: { bg: wine, fg: "#ffffff", ring: gold },
    section: { bg: gold, fg: black },
    footer: { bg: black, fg: "#ffffff", accent: gold, accentFg: black, edge: "reta" },
    hero: "placa",
    deco: [
      { kind: "flame", at: "bl", size: 0.26, rot: 8, color: "#ff7a00", color2: "#ffd84d" },
      { kind: "flame", at: "br", size: 0.22, rot: -10, color: "#c81e00", color2: "#ff9a1f" },
      { kind: "rays", at: "ml", size: 0.26, color: "#4a2a14", color2: "#2a170a" },
    ],
    tag: { label: "Açougue" },
  };
}

export default defineTemplate3({
  id: "acougue-na-brasa",
  version: 3,
  name: "Açougue na Brasa",
  description: "Preto, dourado e madeira: cards escuros com moldura dourada, preço em bandeira dourada e chamas nos cantos.",
  segments: ["acougue"],
  style: "popular",
  palette: { primary: "#121110", secondary: "#D4A645", accent: "#7e0f17", text: "#ffffff", background: "#1d1714" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: acougueLook3,
});
