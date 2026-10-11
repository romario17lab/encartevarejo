// Formatos de peça gerados a partir da mesma campanha.
// Tamanho de renderização em CSS px (base). Exportação raster multiplica por `exportScale`.
// Formatos impressos guardam a medida física em mm; o PDF é gerado nesse tamanho exato.

export type FormatId =
  | "encarte_a4"
  | "post_quadrado"
  | "post_feed"
  | "story"
  | "cartaz_a4"
  | "cartaz_a3"
  | "etiqueta_a4"
  | "banner_vitrine"
  | "tv_horizontal";

export type Channel = "impresso" | "redes" | "loja" | "tv" | "web";

/** grid: vários produtos por página; single: 1 produto por página; tags: folha de etiquetas */
export type FormatKind = "grid" | "single" | "tags";

export interface FormatSpec {
  id: FormatId;
  label: string;
  channel: Channel;
  /** pasta dentro do ZIP do pacote da campanha */
  folder: string;
  kind: FormatKind;
  widthPx: number;
  heightPx: number;
  physical?: { widthMm: number; heightMm: number };
  /** Multiplicador para PNG/JPEG. Impressos: ~300 dpi. */
  exportScale: number;
  /** limites de legibilidade: quantos produtos cabem numa página/tela deste formato */
  minItemsPerPage: number;
  maxItemsPerPage: number;
  /** margem de segurança (px) onde não deve haver texto/preço */
  safeAreaPx: number;
  /** sangria (mm) suportada na exportação PDF quando solicitada */
  bleedMm?: number;
  fileTypes: Array<"png" | "jpeg" | "pdf">;
}

const MM_TO_PX = 96 / 25.4; // CSS px por mm
const mm = (v: number) => Math.round(v * MM_TO_PX);

export const FORMATS: Record<FormatId, FormatSpec> = {
  encarte_a4: {
    id: "encarte_a4", label: "Encarte A4", channel: "impresso", folder: "01-encarte", kind: "grid",
    widthPx: mm(210), heightPx: mm(297), physical: { widthMm: 210, heightMm: 297 }, exportScale: 300 / 96,
    minItemsPerPage: 1, maxItemsPerPage: 24, safeAreaPx: mm(6), bleedMm: 3, fileTypes: ["pdf", "png", "jpeg"],
  },
  post_quadrado: {
    id: "post_quadrado", label: "Post quadrado (1080×1080)", channel: "redes", folder: "02-redes-sociais", kind: "grid",
    widthPx: 1080, heightPx: 1080, exportScale: 1, minItemsPerPage: 1, maxItemsPerPage: 6, safeAreaPx: 48, fileTypes: ["png", "jpeg"],
  },
  post_feed: {
    id: "post_feed", label: "Post vertical feed (1080×1350)", channel: "redes", folder: "02-redes-sociais", kind: "grid",
    widthPx: 1080, heightPx: 1350, exportScale: 1, minItemsPerPage: 1, maxItemsPerPage: 8, safeAreaPx: 48, fileTypes: ["png", "jpeg"],
  },
  story: {
    id: "story", label: "Story e status (1080×1920)", channel: "redes", folder: "02-redes-sociais", kind: "grid",
    // topo e base do story são cobertos pela interface do app: área segura maior
    widthPx: 1080, heightPx: 1920, exportScale: 1, minItemsPerPage: 1, maxItemsPerPage: 6, safeAreaPx: 120, fileTypes: ["png", "jpeg"],
  },
  cartaz_a4: {
    id: "cartaz_a4", label: "Cartaz A4", channel: "loja", folder: "03-cartazes", kind: "single",
    widthPx: mm(210), heightPx: mm(297), physical: { widthMm: 210, heightMm: 297 }, exportScale: 300 / 96,
    minItemsPerPage: 1, maxItemsPerPage: 1, safeAreaPx: mm(8), bleedMm: 3, fileTypes: ["pdf", "png", "jpeg"],
  },
  cartaz_a3: {
    id: "cartaz_a3", label: "Cartaz A3", channel: "loja", folder: "03-cartazes", kind: "single",
    widthPx: mm(297), heightPx: mm(420), physical: { widthMm: 297, heightMm: 420 }, exportScale: 300 / 96,
    minItemsPerPage: 1, maxItemsPerPage: 1, safeAreaPx: mm(10), bleedMm: 3, fileTypes: ["pdf", "png", "jpeg"],
  },
  etiqueta_a4: {
    // folha A4 com 8 etiquetas de 95×65 mm (2 colunas × 4 linhas) e marcas de corte
    id: "etiqueta_a4", label: "Etiquetas de preço (folha A4)", channel: "loja", folder: "04-etiquetas", kind: "tags",
    widthPx: mm(210), heightPx: mm(297), physical: { widthMm: 210, heightMm: 297 }, exportScale: 300 / 96,
    minItemsPerPage: 1, maxItemsPerPage: 8, safeAreaPx: mm(5), fileTypes: ["pdf", "png"],
  },
  banner_vitrine: {
    id: "banner_vitrine", label: "Banner da vitrine (1600×600)", channel: "web", folder: "05-vitrine", kind: "grid",
    widthPx: 1600, heightPx: 600, exportScale: 1, minItemsPerPage: 1, maxItemsPerPage: 4, safeAreaPx: 40, fileTypes: ["png", "jpeg"],
  },
  tv_horizontal: {
    id: "tv_horizontal", label: "Slide para TV (1920×1080)", channel: "tv", folder: "06-tv", kind: "grid",
    widthPx: 1920, heightPx: 1080, exportScale: 1, minItemsPerPage: 1, maxItemsPerPage: 8, safeAreaPx: 64, fileTypes: ["png", "jpeg"],
  },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
export const mmToPx = mm;
