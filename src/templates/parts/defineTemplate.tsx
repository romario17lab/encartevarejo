// Fábrica de modelos: cada modelo declara metadados, paleta, fontes, regras de layout,
// uma "pele" (Skin) e decorações próprias; esta função monta o TemplateDefinition.
import type { ReactElement } from "react";
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import type { TemplateDefinition, TemplateLayoutRules, TemplateRenderProps } from "../contract";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ProductCard } from "./ProductCard";
import { DemoWatermark, SectionTitle } from "./Extras";
import { TagSheet } from "./TagSheet";
import { fontStack } from "./metrics";
import type { Colors, DecorProps, RenderCtx, Skin } from "./types";

/** Regras-base por formato. Os modelos ajustam o que precisarem. */
export const BASE_RULES: Record<FormatId, TemplateLayoutRules> = {
  encarte_a4: { headerRatio: { first: 0.15, continuation: 0.085 }, footerRatio: 0.075, gap: 8, padding: 10, preferredItemsPerPage: 12, maxHeroPerPage: 1, cardAspect: { min: 0.62, max: 1.7 } },
  post_quadrado: { headerRatio: { first: 0.2, continuation: 0.15 }, footerRatio: 0.14, gap: 16, padding: 20, preferredItemsPerPage: 4, maxHeroPerPage: 1, cardAspect: { min: 0.6, max: 1.8 } },
  post_feed: { headerRatio: { first: 0.18, continuation: 0.13 }, footerRatio: 0.12, gap: 16, padding: 20, preferredItemsPerPage: 6, maxHeroPerPage: 1, cardAspect: { min: 0.6, max: 1.8 } },
  story: { headerRatio: { first: 0.21, continuation: 0.17 }, footerRatio: 0.15, gap: 18, padding: 24, preferredItemsPerPage: 4, maxHeroPerPage: 1, cardAspect: { min: 0.55, max: 2.2 } },
  cartaz_a4: { headerRatio: { first: 0.12, continuation: 0.12 }, footerRatio: 0.085, gap: 0, padding: 14, preferredItemsPerPage: 1, maxHeroPerPage: 1, cardAspect: { min: 0.4, max: 2 } },
  cartaz_a3: { headerRatio: { first: 0.12, continuation: 0.12 }, footerRatio: 0.085, gap: 0, padding: 18, preferredItemsPerPage: 1, maxHeroPerPage: 1, cardAspect: { min: 0.4, max: 2 } },
  etiqueta_a4: { headerRatio: { first: 0, continuation: 0 }, footerRatio: 0, gap: 0, padding: 0, preferredItemsPerPage: 8, maxHeroPerPage: 0, cardAspect: { min: 1.2, max: 1.7 } },
  banner_vitrine: { headerRatio: { first: 0.2, continuation: 0.2 }, footerRatio: 0.14, gap: 18, padding: 14, preferredItemsPerPage: 4, maxHeroPerPage: 0, cardAspect: { min: 0.7, max: 1.6 } },
  tv_horizontal: { headerRatio: { first: 0.16, continuation: 0.16 }, footerRatio: 0.11, gap: 22, padding: 22, preferredItemsPerPage: 6, maxHeroPerPage: 1, cardAspect: { min: 0.7, max: 1.8 } },
};

export function layoutRules(tweak: Partial<Record<FormatId, Partial<TemplateLayoutRules>>> & { all?: Partial<TemplateLayoutRules> } = {}): TemplateDefinition["layout"] {
  const out: Partial<Record<FormatId, TemplateLayoutRules>> = {};
  for (const id of FORMAT_IDS) {
    const tags = id === "etiqueta_a4";
    out[id] = { ...BASE_RULES[id], ...(tags ? {} : tweak.all ?? {}), ...(tweak[id] ?? {}) };
  }
  return { ...out, default: out.encarte_a4! };
}

export interface TemplateSpec extends Omit<TemplateDefinition, "renderPage" | "supportedFormats" | "layout" | "useBrandColors"> {
  useBrandColors?: boolean;
  layout?: TemplateDefinition["layout"];
  skin: (c: Colors) => Skin;
  /** fundo/ornamentos próprios do modelo, desenhados atrás do conteúdo */
  Background?: (p: DecorProps) => ReactElement | null;
  /** ornamentos dentro da área do cabeçalho (atrás do texto) */
  HeaderDecor?: (p: DecorProps) => ReactElement | null;
  FooterDecor?: (p: DecorProps) => ReactElement | null;
}

export function defineTemplate(spec: TemplateSpec): TemplateDefinition {
  const { skin: skinFn, Background, HeaderDecor, FooterDecor, ...meta } = spec;
  function renderPage(props: TemplateRenderProps): ReactElement {
    const { campaign, page, format, overrides, colors } = props;
    const skin = skinFn(colors);
    const ctx: RenderCtx = { campaign, page, format, overrides, colors, skin, fontScale: overrides.fontScale ?? 1 };
    const w = format.widthPx;
    const h = format.heightPx;
    const dp = { ...ctx, w, h };
    const showSections = overrides.showCategoryHeaders !== false;
    return (
      <div lang="pt-BR" data-ev-root={`${page.pageIndex + 1}/${page.totalPages}`} data-ev-template={`${spec.id}@${spec.version}`} data-ev-format={format.id}
        style={{ position: "relative", width: w, height: h, overflow: "hidden", background: format.kind === "tags" ? "#ffffff" : skin.page.bg, fontFamily: fontStack(skin.fonts.body.family), color: colors.text, fontVariantNumeric: "lining-nums", boxSizing: "border-box", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        {format.kind === "tags" ? (
          <TagSheet ctx={ctx} />
        ) : (
          <>
            {Background && <Background {...dp} />}
            <Header ctx={ctx} decor={HeaderDecor ? <HeaderDecor {...dp} /> : null} />
            {showSections && page.sections.map((s, i) => <SectionTitle key={`${s.title}-${i}`} section={s} ctx={ctx} />)}
            {page.cells.map((c) => <ProductCard key={c.item.id} cell={c} ctx={ctx} />)}
            <Footer ctx={ctx} decor={FooterDecor ? <FooterDecor {...dp} /> : null} />
          </>
        )}
        {campaign.isDemo && <DemoWatermark w={w} h={h} />}
      </div>
    );
  }
  return {
    ...meta,
    useBrandColors: spec.useBrandColors ?? true,
    supportedFormats: [...FORMAT_IDS],
    layout: spec.layout ?? layoutRules(),
    renderPage,
  };
}
