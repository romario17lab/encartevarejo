// Modelo mínimo SOMENTE para testes do Agente de Geração (não entra no registro de produção).
import { createElement as h } from "react";
import type { TemplateDefinition, TemplateLayoutRules } from "@/templates/contract";
import type { RenderItem } from "@/domain/campaign";
import { emptyOffer } from "@/domain/offer";
import { priceParts } from "@/domain/money";

const base: TemplateLayoutRules = {
  headerRatio: { first: 0.2, continuation: 0.1 }, footerRatio: 0.08, gap: 12, padding: 8,
  preferredItemsPerPage: 12, maxHeroPerPage: 1, cardAspect: { min: 0.6, max: 1.6 },
};

export const testTemplate: TemplateDefinition = {
  id: "teste-geracao", version: 1, name: "Modelo de teste", description: "Somente testes",
  segments: ["supermercado"], style: "popular",
  palette: { primary: "#0b6e2e", secondary: "#ffd400", accent: "#d61f1f", text: "#111111", background: "#ffffff" },
  useBrandColors: true, fonts: { display: "Anton", body: "Inter", price: "Oswald" },
  supportedFormats: ["encarte_a4", "post_quadrado", "post_feed", "story", "cartaz_a4", "cartaz_a3", "etiqueta_a4", "banner_vitrine", "tv_horizontal"],
  layout: {
    default: base,
    story: { ...base, preferredItemsPerPage: 4, headerRatio: { first: 0.18, continuation: 0.12 } },
    post_quadrado: { ...base, preferredItemsPerPage: 4 },
    banner_vitrine: { ...base, preferredItemsPerPage: 4, headerRatio: { first: 0.25, continuation: 0.25 }, cardAspect: { min: 0.6, max: 2.2 } },
    tv_horizontal: { ...base, preferredItemsPerPage: 6, cardAspect: { min: 0.7, max: 2 } },
  },
  renderPage: ({ campaign, page, format, colors }) =>
    h("div", { style: { position: "relative", width: format.widthPx, height: format.heightPx, background: colors.background, fontFamily: "Inter" } },
      h("div", { style: { position: "absolute", left: page.header.x, top: page.header.y, width: page.header.w, height: page.header.h, background: colors.primary, color: "#fff", fontSize: 40 } }, campaign.title),
      ...page.sections.map((s) => h("div", { key: s.title + s.rect.y, style: { position: "absolute", left: s.rect.x, top: s.rect.y, width: s.rect.w, height: s.rect.h, background: colors.secondary } }, s.title)),
      ...page.cells.map((c) => {
        const cents = c.item.offer.priceCents ?? c.item.offer.comboCents ?? 0;
        const pp = priceParts(cents);
        return h("div", { key: c.item.id, "data-ev-cell": c.item.id, style: { position: "absolute", left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h, border: "2px solid " + colors.primary, overflow: "hidden", background: "#fff" } },
          h("div", { style: { fontSize: 16 } }, c.item.name),
          h("div", { "data-ev-price": "", style: { fontSize: 32, color: colors.accent, fontWeight: 700 } }, `${pp.currency} ${pp.integer},${pp.decimal}`));
      }),
      h("div", { style: { position: "absolute", left: page.footer.x, top: page.footer.y, width: page.footer.w, height: page.footer.h, background: colors.secondary, fontSize: 14 } }, campaign.validityText)),
};

export function makeItems(n: number, opts: { highlight?: number[]; categories?: string[]; longName?: number[]; noImage?: boolean } = {}): RenderItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `itm_${String(i).padStart(3, "0")}`,
    name: opts.longName?.includes(i) ? `Produto de teste número ${i} com um nome realmente muito comprido para caber` : `Produto ${i}`,
    brand: null, sizeLabel: "1kg", unit: "kg" as const,
    category: opts.categories ? opts.categories[i % opts.categories.length] : null,
    imageUrl: opts.noImage ? null : `/img/${i}.webp`,
    imageFit: { x: 50, y: 50, zoom: 1 },
    offer: { ...emptyOffer(), priceCents: 499 + i },
    highlight: opts.highlight?.includes(i) ?? false,
  }));
}
