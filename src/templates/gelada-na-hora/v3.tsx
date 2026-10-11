// Modelo "Gelada na Hora" v3 — azul #1747C9 / #0D2A8A + amarelo (bebidas).
// Preço em PÍLULA azul-marinho com contorno amarelo; card com HEXÁGONO ciano atrás da foto saindo pelo topo;
// fundo azul com raios, bolhas e a palavra da campanha; título em faixa; gotas e bolhas nos cantos.
import { defineTemplate3, layoutRules3 } from "../parts3/define3";
import { ground3, SEGMENT_PALETTES, type Look3 } from "../parts3/look3";
import { lighten } from "../parts2/look";
import type { Colors } from "../parts/types";

export function geladaLook3(c: Colors): Look3 {
  void c;
  const P = SEGMENT_PALETTES.azul;
  const blue = P.blue, navy = P.navy, yellow = P.yellow, ink = "#06163f";
  return {
    fonts: { name: { family: "Oswald", weight: 700, upper: true }, price: { family: "Oswald", weight: 700 }, body: { family: "Inter", weight: 800 }, label: { family: "Oswald", weight: 700 } },
    page: ground3(blue, lighten(blue, 0.2), navy, [
      { kind: "rays", color: "#ffffff", opacity: 0.08 },
      { kind: "texture", texture: "bubbles", color: "#fff", opacity: 0.6 },
      { kind: "word", color: "#ffffff", opacity: 0.05 },
    ]),
    header: { ground: ground3(navy, lighten(navy, 0.25), "#050f33", [{ kind: "texture", texture: "ice", color: "#fff", opacity: 0.9 }, { kind: "stripes", color: "#ffffff", opacity: 0.05, angle: 60 }], { accents: ["#bdf3ff"] }), edge: "wave", edgeColor: "#22d3ee", object: "bucket", fg: "#ffffff" },
    title: { mode: "faixa", face: { family: "Anton", weight: 400 }, script: { family: "Playfair Display", weight: 700, italic: true }, fill: "#ffffff", keyFill: yellow, scriptFill: "#ffffff", outline: "#03113a", shadow: "#020a26", bandBg: "#ffffff", bandFg: navy, angle: -4 },
    ribbon: { bg: yellow, fg: ink, face: { family: "Oswald", weight: 700 } },
    logo: { bg: "#ffffff", border: yellow, fg: navy },
    card: { style: "hexagono", bg: "#f4fbff", fg: ink, meta: "#2c4a6b", accent: "#bdeefb", accentFg: ink, radius: 0.07, shadow: "#071a55", heroBg: "#fff6c8", heroFg: ink, heroLabel: "Trincando", heroLabelBg: navy, heroLabelFg: yellow, align: "left" },
    price: { shape: "pilula", bg: navy, fg: "#ffffff", outline: yellow, shadow: "#020a26", sealBg: yellow, sealFg: ink, tabBg: "#e3120b", tabFg: "#ffffff", oldBg: yellow, oldFg: ink, strike: "#d10000", align: "right" },
    burst: { bg: yellow, fg: ink, ring: navy },
    section: { bg: navy, fg: yellow },
    footer: { bg: "#06163f", fg: "#ffffff", accent: yellow, accentFg: ink, edge: "onda" },
    hero: "placa",
    deco: [
      { kind: "drop", at: "ml", size: 0.15, rot: -12, color: "#7fdcff", color2: "#ffffff" },
      { kind: "bubble", at: "mr", size: 0.2, color: "#bdf3ff", color2: "#ffffff" },
      { kind: "drop", at: "br", size: 0.2, rot: 20, color: "#5cc8f5", color2: "#ffffff" },
    ],
    tag: { label: "Gelada" },
  };
}

export default defineTemplate3({
  id: "gelada-na-hora",
  version: 3,
  name: "Gelada na Hora",
  description: "Azul royal e marinho com gelo e bolhas: título com faixa branca, preço em pílula com contorno amarelo e foto saindo de um hexágono.",
  segments: ["bebidas"],
  style: "moderno",
  palette: { primary: "#1747C9", secondary: "#0D2A8A", accent: "#FFC20E", text: "#06163f", background: "#f4fbff" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Oswald" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules3(),
  look: geladaLook3,
});
