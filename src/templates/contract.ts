import type { ReactElement } from "react";
import type { FormatId, FormatSpec } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign, RenderItem } from "@/domain/campaign";

// =====================================================================
// CONTRATO DE MODELOS E LAYOUT
//  - src/layout/**   (Agente de Geração) calcula páginas e células: layoutPiece()
//  - src/templates/** (Agente de Design) desenha cada página: TemplateDefinition.renderPage()
//  - Prévia (editor) e exportação (Chromium) usam EXATAMENTE o mesmo componente
//    <PieceRenderer/> em src/render/PieceRenderer.tsx, em tamanho nativo (px do formato).
// =====================================================================

export interface Rect { x: number; y: number; w: number; h: number }

/** Tamanho visual de um card de produto. hero = destaque principal. */
export type CellSize = "hero" | "large" | "normal" | "compact";

export interface LayoutCell {
  item: RenderItem;
  rect: Rect; // coordenadas absolutas em px dentro da página
  size: CellSize;
  /** índice global do item na peça (para numeração/acessibilidade) */
  index: number;
}

export interface LayoutSection {
  /** cabeçalho de categoria (quando ordenado por categoria) */
  title: string;
  rect: Rect;
}

export interface PageLayout {
  pageIndex: number;
  totalPages: number;
  header: Rect; // área do cabeçalho (logo, título)
  body: Rect; // área de produtos
  footer: Rect; // área do rodapé (validade, contatos)
  cells: LayoutCell[];
  sections: LayoutSection[];
  /** primeira página pode ter capa/cabeçalho maior; demais páginas cabeçalho compacto */
  variant: "first" | "continuation" | "single";
}

export interface LayoutWarning {
  code: "too_many_items" | "item_hidden" | "long_name_truncated" | "missing_image" | "overflow" | "overlap" | "invalid_price";
  message: string; // em português, pronto para o usuário
  itemId?: string;
  pageIndex?: number;
}

export interface LayoutResult {
  format: FormatSpec;
  pages: PageLayout[];
  warnings: LayoutWarning[];
}

/** Regras de layout que cada modelo declara por formato. O motor de layout respeita estas regras. */
export interface TemplateLayoutRules {
  /** altura do cabeçalho como fração da altura da página, na primeira página e nas seguintes */
  headerRatio: { first: number; continuation: number };
  footerRatio: number;
  /** espaçamento entre cards (px no tamanho base do formato) */
  gap: number;
  /** padding interno da área de produtos */
  padding: number;
  /** quantidade preferida de produtos por página (o motor ajusta dentro de min/max do formato) */
  preferredItemsPerPage: number;
  /** quantos destaques (hero) no máximo por página */
  maxHeroPerPage: number;
  /** proporção mínima largura/altura aceitável para um card normal */
  cardAspect: { min: number; max: number };
}

export type Segment = "supermercado" | "hortifruti" | "acougue" | "padaria" | "bebidas" | "varejo" | "sazonal";
export type TemplateStyle = "popular" | "moderno" | "elegante" | "economico";

export interface TemplateRenderProps {
  campaign: RenderCampaign;
  page: PageLayout;
  format: FormatSpec;
  overrides: PieceOverrides;
  /** cores finais já mescladas: modelo → identidade da loja → overrides */
  colors: RenderCampaign["brand"]["colors"];
}

export interface TemplateDefinition {
  id: string; // slug estável: "feira-fresca"
  version: number; // inteiro; nova versão = nova entrada no registro, a antiga é mantida
  name: string;
  description: string;
  segments: Segment[];
  style: TemplateStyle;
  /** paleta padrão do modelo; a identidade da loja pode substituir conforme useBrandColors */
  palette: RenderCampaign["brand"]["colors"];
  /** se true, as cores da loja substituem a paleta do modelo; se false, só o logo/contatos */
  useBrandColors: boolean;
  fonts: { display: string; body: string; price: string }; // famílias carregadas em src/render/fonts.css
  supportedFormats: FormatId[];
  layout: Partial<Record<FormatId, TemplateLayoutRules>> & { default: TemplateLayoutRules };
  /** renderiza UMA página no tamanho nativo do formato (position: relative; width/height = formato) */
  renderPage: (props: TemplateRenderProps) => ReactElement;
  /** miniatura/prévia para galeria: usa dados de demonstração */
  thumbnailFormat?: FormatId;
}

export type LayoutFn = (input: {
  campaign: RenderCampaign;
  format: FormatSpec;
  template: TemplateDefinition;
  overrides: PieceOverrides;
}) => LayoutResult;
