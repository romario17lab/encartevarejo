// Modelo "Mega Ofertas" v2 — vermelho + amarelo explosivo sobre preto.
// Cabeçalho em raios de fogo (amarelo→vermelho) com borda em zigue-zague, megafone vazando do quadro,
// fundo preto com faixas de alerta, título 3D com a palavra principal amarela.
import { defineTemplate2, layoutRules2 } from "../parts2/define2";
import { pop, strong, type Look } from "../parts2/look";
import type { Colors } from "../parts/types";

export function megaLook(c: Colors): Look {
  const yellow = pop(c.secondary, "#ffe500");
  const red = strong(c.accent, "#e3120b", 0.2);
  const ink = "#0d0d0d";
  return {
    fonts: { name: { family: "Inter", weight: 900, upper: true }, price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 800 }, label: { family: "Inter", weight: 900 } },
    page: { kind: "hazard", base: "#141414", light: "#3a3a3a", dark: "#000000", accents: [yellow] },
    header: { ground: { kind: "rays", base: red, light: "#ffb300", dark: "#3a0000" }, edge: "zigzag", edgeColor: yellow, object: "megaphone", fg: "#ffffff" },
    title: { face: { family: "Anton", weight: 400 }, fill: ["#ffffff", "#f2f2f2"], keyFill: [yellow, "#ff9800"], stroke: ink, outer: "#000000", extrude: "#5a0000", depth: 0.11, connectorBg: yellow, connectorFg: ink },
    ribbon: { bg: yellow, fg: ink, face: { family: "Inter", weight: 900 } },
    logo: { bg: "#ffffff", border: red, fg: ink },
    card: { bg: "#ffffff", fg: ink, meta: "#444444", radius: 0.04, shadow: `0 0 0 2px ${yellow}, 0 4px 0 rgba(0,0,0,.5)`, heroBg: yellow, heroFg: ink, heroLabel: "Mega oferta", heroLabelBg: red, heroLabelFg: "#ffffff" },
    plate: { bg: ink, fg: "#ffffff", tabBg: red, tabFg: "#ffffff", oldBg: yellow, oldFg: ink, strike: "#d10000" },
    burst: { bg: red, fg: "#ffffff", ring: yellow },
    section: { bg: yellow, fg: ink },
    footer: { bg: "#000000", fg: "#ffffff", accent: yellow, edge: yellow },
    tag: { label: "Mega oferta" },
  };
}

export default defineTemplate2({
  id: "mega-ofertas",
  version: 2,
  name: "Mega Ofertas",
  description: "Explosivo: raios de fogo, megafone, faixas de alerta e título 3D amarelo. Para saldões, aniversário da loja e semanas de desconto.",
  segments: ["sazonal", "varejo", "supermercado"],
  style: "popular",
  palette: { primary: "#111111", secondary: "#ffe500", accent: "#e3120b", text: "#ffffff", background: "#0b0b0b" },
  useBrandColors: false,
  fonts: { display: "Anton", body: "Inter", price: "Anton" },
  thumbnailFormat: "encarte_a4",
  layout: layoutRules2(),
  look: megaLook,
});
