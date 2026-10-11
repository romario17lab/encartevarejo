// Fábrica dos modelos v2: cada modelo declara metadados, paleta e um "visual" (Look);
// esta função monta o TemplateDefinition. O motor de layout continua decidindo páginas e células.
import type { ReactElement } from "react";
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import type { LayoutSection, TemplateDefinition, TemplateLayoutRules, TemplateRenderProps } from "../contract";
import { BASE_RULES } from "../parts/defineTemplate";
import { DemoWatermark } from "../parts/Extras";
import { ensureContrast } from "../parts/color";
import type { Colors } from "../parts/types";
import { GroundFill } from "./grounds";
import { Header2 } from "./Header2";
import { Footer2 } from "./Footer2";
import { Card2 } from "./Card2";
import { TagSheet2 } from "./Tags2";
import { Ribbon } from "./Ribbon";
import { fontStack } from "./measure";
import type { Ctx2, Look } from "./look";

/** Regras-base v2: cabeçalho maior na 1ª página (título-ilustração), rodapé em pílula, cards mais juntos. */
export const BASE_RULES_V2: Record<FormatId, TemplateLayoutRules> = {
  ...BASE_RULES,
  encarte_a4: { ...BASE_RULES.encarte_a4, headerRatio: { first: 0.19, continuation: 0.1 }, footerRatio: 0.072, gap: 7, padding: 6 },
  post_quadrado: { ...BASE_RULES.post_quadrado, headerRatio: { first: 0.23, continuation: 0.17 }, footerRatio: 0.12, gap: 14, padding: 10 },
  post_feed: { ...BASE_RULES.post_feed, headerRatio: { first: 0.21, continuation: 0.15 }, footerRatio: 0.105, gap: 14, padding: 10 },
  story: { ...BASE_RULES.story, headerRatio: { first: 0.235, continuation: 0.19 }, footerRatio: 0.135, gap: 16, padding: 12, cardAspect: { min: 0.45, max: 2.2 } },
  cartaz_a4: { ...BASE_RULES.cartaz_a4, headerRatio: { first: 0.15, continuation: 0.15 }, footerRatio: 0.08, padding: 8 },
  cartaz_a3: { ...BASE_RULES.cartaz_a3, headerRatio: { first: 0.15, continuation: 0.15 }, footerRatio: 0.08, padding: 10 },
  banner_vitrine: { ...BASE_RULES.banner_vitrine, headerRatio: { first: 0.24, continuation: 0.24 }, footerRatio: 0.17, gap: 16, padding: 8 },
  tv_horizontal: { ...BASE_RULES.tv_horizontal, headerRatio: { first: 0.18, continuation: 0.16 }, footerRatio: 0.13, gap: 18, padding: 10 },
};

export function layoutRules2(tweak: Partial<Record<FormatId, Partial<TemplateLayoutRules>>> & { all?: Partial<TemplateLayoutRules> } = {}): TemplateDefinition["layout"] {
  const out: Partial<Record<FormatId, TemplateLayoutRules>> = {};
  for (const id of FORMAT_IDS) out[id] = { ...BASE_RULES_V2[id], ...(id === "etiqueta_a4" ? {} : tweak.all ?? {}), ...(tweak[id] ?? {}) };
  return { ...out, default: out.encarte_a4! };
}

export interface TemplateSpec2 extends Omit<TemplateDefinition, "renderPage" | "supportedFormats" | "layout" | "useBrandColors"> {
  useBrandColors?: boolean;
  layout?: TemplateDefinition["layout"];
  look: (c: Colors) => Look;
}

function Section2({ section, ctx }: { section: LayoutSection; ctx: Ctx2 }) {
  const { x, y, w, h } = section.rect;
  const { look } = ctx;
  return (
    <div data-ev-section="" style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <Ribbon text={section.title} x={0} y={h * 0.06} w={w * 0.7} h={h * 0.88} bg={look.section.bg} fg={ensureContrast(look.section.fg, look.section.bg, 4.5)} face={look.ribbon.face} angle={-1.2} align="left" />
    </div>
  );
}

export function defineTemplate2(spec: TemplateSpec2): TemplateDefinition {
  const { look: lookFn, ...meta } = spec;
  function renderPage(props: TemplateRenderProps): ReactElement {
    const { campaign, page, format, overrides, colors } = props;
    const look = lookFn(colors);
    const ctx: Ctx2 = { campaign, page, format, overrides, colors, look, fontScale: overrides.fontScale ?? 1 };
    const w = format.widthPx;
    const h = format.heightPx;
    const showSections = overrides.showCategoryHeaders !== false;
    return (
      <div lang="pt-BR" data-ev-root={`${page.pageIndex + 1}/${page.totalPages}`} data-ev-template={`${spec.id}@${spec.version}`} data-ev-format={format.id}
        style={{ position: "relative", width: w, height: h, overflow: "hidden", background: format.kind === "tags" ? "#ffffff" : look.page.base, fontFamily: fontStack("Inter"), color: colors.text, fontVariantNumeric: "lining-nums", boxSizing: "border-box", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
        {format.kind === "tags" ? (
          <TagSheet2 ctx={ctx} />
        ) : (
          <>
            <GroundFill g={look.page} w={w} h={h} seed={page.pageIndex + 11} focus="50% 55%" />
            <Header2 ctx={ctx} />
            {showSections && page.sections.map((s, i) => <Section2 key={`${s.title}-${i}`} section={s} ctx={ctx} />)}
            {page.cells.map((c) => <Card2 key={c.item.id} cell={c} ctx={ctx} />)}
            <Footer2 ctx={ctx} />
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
    layout: spec.layout ?? layoutRules2(),
    renderPage,
  };
}
