// "Visual" dos modelos v3 (técnicas do estudo do Canva, docs/01d-analise-canva.md, com a força da v2):
// etiqueta de preço com vários formatos, título em camadas (faixa inclinada / cursiva + condensada),
// fundo em camadas com intensidade ajustável, cards com foto saindo do quadro e variações de card,
// elementos de profundidade próprios cortados pela borda, rodapé completo e kits de datas.
import type { Face } from "../parts2/measure";
import type { EdgeKind, GroundKind, ObjectKind } from "../parts2/look";
import type { RenderCtx as RenderCtx1 } from "../parts/types";

/** Formatos da etiqueta de preço (cada modelo escolhe um; a ordem R$ · inteiro · centavos · unidade é fixa). */
export type PriceShape3 = "placa" | "pilula" | "etiqueta" | "circulo" | "selo" | "solto" | "bandeira" | "ticket" | "explosao";
/** Estilos de card. */
export type CardStyle3 = "recorte" | "orelha" | "circulo" | "hexagono" | "split" | "moldura" | "arco";
/** Produto herói (1 item na página, item em destaque, cartaz). */
export type HeroMode3 = "pedestal" | "placa";

export type LayerKind3 =
  | "stripes" // listras diagonais
  | "rays" // raios a partir de um foco
  | "dots" // pontinhos (meio-tom)
  | "word" // palavra da campanha repetida, bem clara
  | "grid" // quadriculado fino
  | "waves" // ondas
  | "confetti"
  | "texture"; // textura v2 (madeira, papel, kraft, carbono, neve, bolhas, folhas, trigo, gelo...)

export interface Layer3 {
  kind: LayerKind3;
  color: string;
  /** opacidade base (multiplicada pela intensidade do fundo) */
  opacity: number;
  angle?: number;
  /** escala do padrão (1 = padrão) */
  scale?: number;
  /** para kind "texture" */
  texture?: GroundKind;
  /** foco (raios) */
  focus?: string;
}

export interface Ground3 {
  base: string;
  light: string;
  dark: string;
  gradient: "radial" | "linear" | "flat-ish";
  layers: Layer3[];
  /** intensidade global das camadas (0 = só o degradê, 1 = padrão, até 1.6) */
  intensity: number;
  /** cores de ornamento para texturas v2 */
  accents?: string[];
}

export type DecoKind3 = "percent" | "rays" | "tag" | "leaf" | "star" | "drop" | "wheat" | "flame" | "bubble" | "ornament" | "snowflake" | "egg" | "heart" | "flower" | "bolt" | "flag" | "coin";

export interface DecoSpot3 {
  kind: DecoKind3;
  /** canto da página (o elemento fica parcialmente fora da página, cortado pela borda) */
  at: "tl" | "tr" | "bl" | "br" | "ml" | "mr";
  /** tamanho como fração do menor lado da página */
  size: number;
  rot?: number;
  color: string;
  color2?: string;
}

export type KitId3 = "natal" | "pascoa" | "maes" | "blackfriday" | "arraia";

export interface TitleStyle3 {
  /** faixa: palavra principal grande + uma linha numa faixa inclinada; cursiva: partes em cursiva + palavra condensada */
  mode: "faixa" | "cursiva";
  face: Face;
  script: Face;
  fill: string;
  keyFill: string;
  scriptFill: string;
  outline: string;
  shadow: string;
  bandBg: string;
  bandFg: string;
  /** inclinação da faixa (graus) */
  angle: number;
  /** força a palavra principal */
  keyWord?: (words: string[]) => number;
}

export interface Look3 {
  fonts: { name: Face & { upper: boolean }; price: Face; body: Face; label: Face };
  page: Ground3;
  header: {
    ground: Ground3 | null; // null: o fundo da página continua no cabeçalho
    edge: EdgeKind | "none";
    edgeColor: string;
    object?: ObjectKind;
    fg: string;
  };
  title: TitleStyle3;
  ribbon: { bg: string; fg: string; face: Face };
  logo: { bg: string; border: string; fg: string };
  card: {
    style: CardStyle3;
    bg: string;
    fg: string;
    meta: string;
    /** cor da orelha / metade de baixo / disco atrás da foto / moldura */
    accent: string;
    accentFg: string;
    radius: number;
    /** sombra dura (sem desfoque) */
    shadow: string;
    border?: string;
    heroBg: string;
    heroFg: string;
    heroLabel: string;
    heroLabelBg: string;
    heroLabelFg: string;
    align: "left" | "center";
  };
  price: {
    shape: PriceShape3;
    bg: string;
    fg: string;
    outline: string;
    shadow: string;
    sealBg: string;
    sealFg: string;
    tabBg: string;
    tabFg: string;
    oldBg: string;
    oldFg: string;
    strike: string;
    align: "left" | "center" | "right";
  };
  burst: { bg: string; fg: string; ring: string };
  section: { bg: string; fg: string };
  footer: { bg: string; fg: string; accent: string; accentFg: string; edge: "reta" | "diagonal" | "onda" };
  hero: HeroMode3;
  deco: DecoSpot3[];
  kit?: KitId3;
  tag: { label: string };
}

export interface Ctx3 extends Omit<RenderCtx1, "skin"> { look: Look3 }

// ------------------------------------------------------------------ paletas por segmento (Canva)

/** Paletas de referência do estudo (cores aproximadas). Os modelos partem delas; a loja pode substituir onde o modelo permite. */
export const SEGMENT_PALETTES = {
  promo: { red: "#D7192D", yellow: "#FFC20E", ink: "#141414" },
  verde: { green: "#1E8F3A", yellow: "#FFC20E", ink: "#10240f" },
  azul: { blue: "#1747C9", navy: "#0D2A8A", yellow: "#FFC20E" },
  premium: { black: "#121110", gold: "#D4A645", wood: "#6b3f22" },
  editorial: { beige: "#F3E6CF", brown: "#5A3418", caramel: "#B9752F" },
} as const;

export function ground3(base: string, light: string, dark: string, layers: Layer3[], o: Partial<Pick<Ground3, "gradient" | "intensity" | "accents">> = {}): Ground3 {
  return { base, light, dark, layers, gradient: o.gradient ?? "radial", intensity: o.intensity ?? 1, accents: o.accents };
}
