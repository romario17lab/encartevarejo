// Fábrica dos modelos v3. Densidade por formato (estudo do Canva) declarada nas regras de layout
// que o motor já usa (preferredItemsPerPage): story 3 por tela (paginando em várias telas), post 4–6,
// encarte 16 por página (12–20), cartaz 1. O motor de layout não muda: v1/v2 continuam idênticas.
import type { ReactElement } from "react";
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import type { LayoutSection, TemplateDefinition, TemplateLayoutRules, TemplateRenderProps } from "../contract";
import { BASE_RULES } from "../parts/defineTemplate";
import { DemoWatermark } from "../parts/Extras";
import { ensureContrast } from "../parts/color";
import type { Colors } from "../parts/types";
import { Ribbon } from "../parts2/Ribbon";
import { fontStack } from "../parts2/measure";
import { Layers3 } from "./layers";
import { PageDeco } from "./deco";
import { Header3, campaignWord } from "./Header3";
import { Footer3 } from "./Footer3";
import { Card3 } from "./Card3";
import { TagSheet3 } from "./Tags3";
import type { Ctx3, Look3 } from "./look3";

/** Regras-base v3: menos produtos por tela nas redes, rodapé completo (mais alto), cards com folga para a foto sair. */
export const BASE_RULES_V3: Record<FormatId, TemplateLayoutRules> = {
  ...BASE_RULES,
  encarte_a4: { ...BASE_RULES.encarte_a4, headerRatio: { first: 0.17, continuation: 0.095 }, footerRatio: 0.088, gap: 9, padding: 6, preferredItemsPerPage: 16, cardAspect: { min: 0.62, max: 1.6 } },
  post_quadrado: { ...BASE_RULES.post_quadrado, headerRatio: { first: 0.225, continuation: 0.17 }, footerRatio: 0.13, gap: 18, padding: 8, preferredItemsPerPage: 4 },
  post_feed: { ...BASE_RULES.post_feed, headerRatio: { first: 0.205, continuation: 0.15 }, footerRatio: 0.115, gap: 18, padding: 8, preferredItemsPerPage: 6 },
  story: { ...BASE_RULES.story, headerRatio: { first: 0.225, continuation: 0.17 }, footerRatio: 0.138, gap: 22, padding: 10, preferredItemsPerPage: 3, cardAspect: { min: 0.5, max: 2.4 } },
  cartaz_a4: { ...BASE_RULES.cartaz_a4, headerRatio: { first: 0.15, continuation: 0.15 }, footerRatio: 0.095, padding: 8 },
  cartaz_a3: { ...BASE_RULES.cartaz_a3, headerRatio: { first: 0.15, continuation: 0.15 }, footerRatio: 0.095, padding: 10 },
  banner_vitrine: { ...BASE_RULES.banner_vitrine, headerRatio: { first: 0.25, continuation: 0.25 }, footerRatio: 0.17, gap: 20, padding: 6, preferredItemsPerPage: 3 },
  tv_horizontal: { ...BASE_RULES.tv_horizontal, headerRatio: { first: 0.19, continuation: 0.16 }, footerRatio: 0.13, gap: 24, padding: 8, preferredItemsPerPage: 6 },
};

export function layoutRules3(tweak: Partial<Record<FormatId, Partial<TemplateLayoutRules>>> & { all?: Partial<TemplateLayoutRules> } = {}): TemplateDefinition["layout"] {
  const out: Partial<Record<FormatId, TemplateLayoutRules>> = {};
  for (const id of FORMAT_IDS) out[id] = { ...BASE_RULES_V3[id], ...(id === "etiqueta_a4" ? {} : tweak.all ?? {}), ...(tweak[id] ?? {}) };
  return { ...out, default: out.encarte_a4! };
}

export interface TemplateSpec3 extends Omit<TemplateDefinition, "renderPage" | "supportedFormats" | "layout" | "useBrandColors"> {
  useBrandColors?: boolean;
  layout?: TemplateDefinition["layout"];
  look: (c: Colors) => Look3;
}

function Section3({ section, ctx }: { section: LayoutSection; ctx: Ctx3 }) {
  const { x, y, w, h } = section.rect;
  const { look } = ctx;
  return (
    <div data-ev-section="" style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <Ribbon text={section.title} x={0} y={h * 0.06} w={w * 0.7} h={h * 0.88} bg={look.section.bg} fg={ensureContrast(look.section.fg, look.section.bg, 4.5)} face={look.ribbon.face} angle={-1.2} align="left" />
    </div>
  );
}

export function defineTemplate3(spec: TemplateSpec3): TemplateDefinition {
  const { look: lookFn, ...meta } = spec;
  function renderPage(props: TemplateRenderProps): ReactElement {
    const { campaign, page, format, overrides, colors } = props;
    const look = lookFn(colors);
    const ctx: Ctx3 = { campaign, page, format, overrides, colors, look, fontScale: overrides.fontScale ?? 1 };
    const w = format.widthPx;
    const h = format.heightPx;
    const showSections = overrides.showCategoryHeaders !== false;
    const word = campaignWord((overrides.title ?? campaign.title) || "Ofertas");
    return (
      <div lang="pt-BR" data-ev-root={`${page.pageIndex + 1}/${page.totalPages}`} data-ev-template={`${spec.id}@${spec.version}`} data-ev-format={format.id}
        style={{ position: "relative", width: w, height: h, overflow: "hidden", background: format.kind === "tags" ? "#ffffff" : look.page.base, fontFamily: fontStack("Inter"), color: colors.text, fontVariantNumeric: "lining-nums", boxSizing: "border-box", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        {format.kind === "tags" ? (
          <TagSheet3 ctx={ctx} />
        ) : (
          <>
            <Layers3 g={look.page} w={w} h={h} word={word} seed={page.pageIndex + 11} focus="50% 45%" />
            <PageDeco spots={look.deco} W={w} H={h} top={page.header.h} />
            <Header3 ctx={ctx} />
            {showSections && page.sections.map((s, i) => <Section3 key={`${s.title}-${i}`} section={s} ctx={ctx} />)}
            {page.cells.map((c) => <Card3 key={c.item.id} cell={c} ctx={ctx} alone={page.cells.length === 1} />)}
            <Footer3 ctx={ctx} />
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
    layout: spec.layout ?? layoutRules3(),
    renderPage,
  };
}
