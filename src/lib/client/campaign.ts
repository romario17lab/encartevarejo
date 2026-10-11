import type { CampaignItem, RenderCampaign, RenderBrand } from "@/domain/campaign";
import { emptyOffer, validateOffer, type Offer } from "@/domain/offer";
import { assetUrl, type Product } from "./api";
import { validityText } from "./format";

/** Oferta inicial a partir dos preços do catálogo. Nada é inventado: sem preço → fica vazio e gera aviso. */
export function offerFromProduct(p: Pick<Product, "regularCents" | "promoCents" | "conditions">): Offer {
  const o = emptyOffer();
  if (p.promoCents != null && p.regularCents != null && p.regularCents > p.promoCents) return { ...o, mode: "from_to", priceCents: p.promoCents, regularCents: p.regularCents, conditions: p.conditions ?? null };
  return { ...o, mode: "simple", priceCents: p.promoCents ?? p.regularCents ?? null, conditions: p.conditions ?? null };
}

const ALPH = "0123456789abcdefghijklmnopqrstuvwxyz";
/** Id de item no mesmo formato do servidor (itm_ + 20 caracteres), gerado no navegador. */
export function newItemId() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "itm_" + Array.from(bytes, (b) => ALPH[b % 36]).join("");
}

export function itemFromProduct(p: Product, position: number): CampaignItem {
  return {
    id: newItemId(), productId: p.id, name: p.name, brand: p.brand, sizeLabel: p.sizeLabel, unit: p.unit, category: p.category,
    imageAssetId: p.imageAssetId, imageFit: { x: 50, y: 50, zoom: 1 }, offer: offerFromProduct(p), highlight: false, position, paused: false,
  };
}

export function itemErrors(it: Pick<CampaignItem, "offer" | "unit">) {
  return validateOffer(it.offer, { unit: it.unit }).filter((i) => i.level === "error");
}

/**
 * RenderCampaign montada no navegador a partir do estado do editor, para a prévia ao vivo.
 * A marca vem de /render-data (servidor); itens, títulos e validade vêm do estado local.
 * Imagens usam /api/assets/:id (sessão) — a exportação usa URLs assinadas, mesmo conteúdo.
 */
export function buildRenderCampaign(input: {
  id: string; version: number; title: string; subtitle: string | null; startsAt: string | null; endsAt: string | null; validityNote: string | null;
  items: CampaignItem[]; brand: RenderBrand; legalText: string | null; serverValidityText?: string | null; isDemo?: boolean;
}): RenderCampaign {
  const items = [...input.items].sort((a, b) => a.position - b.position).map((it) => ({
    id: it.id, name: it.name, brand: it.brand, sizeLabel: it.sizeLabel, unit: it.unit, category: it.category,
    imageUrl: assetUrl(it.imageAssetId), imageFit: it.imageFit, offer: it.offer, highlight: it.highlight,
  }));
  return {
    id: input.id, version: input.version, title: input.title, subtitle: input.subtitle,
    validityText: validityText(input.startsAt, input.endsAt, input.validityNote),
    legalText: input.legalText, items, brand: input.brand, isDemo: !!input.isDemo,
  };
}

/** Nome sugerido a partir da validade: "Ofertas de 13 a 15/10" (nunca data/hora). */
export function suggestCampaignName(startInput: string, endInput: string): string {
  const p = (v: string) => { const [, m, d] = v.split("-"); return { d: String(Number(d)), m }; };
  if (startInput && endInput) {
    const a = p(startInput); const b = p(endInput);
    if (startInput === endInput) return `Ofertas de ${a.d}/${a.m}`;
    return a.m === b.m ? `Ofertas de ${a.d} a ${b.d}/${b.m}` : `Ofertas de ${a.d}/${a.m} a ${b.d}/${b.m}`;
  }
  return "Ofertas da Semana";
}

/**
 * Mecânica padrão da campanha: muda o tipo de oferta de todos os itens, mantendo os valores já informados.
 * Nada é inventado: se faltar o preço anterior (de/por) o item fica com erro e vira exceção a corrigir.
 */
export function applyModeToAll<T extends { offer: Offer }>(items: T[], mode: Offer["mode"]): T[] {
  return items.map((it) => {
    if (it.offer.mode === mode) return it;
    const o = { ...it.offer, mode };
    // de/por → simples: o preço anterior deixa de aparecer, mas continua guardado como preço normal
    return { ...it, offer: o };
  });
}

/** Aviso de mistura de mecânicas: alguns com "De/Por" e outros com preço simples. */
export function mixedMechanicsWarning(offers: Offer[]): string | null {
  const ft = offers.filter((o) => o.mode === "from_to").length;
  const simple = offers.filter((o) => o.mode === "simple").length;
  if (ft > 0 && simple > 0) return `Alguns produtos têm preço anterior (De/Por: ${ft}) e outros não (preço simples: ${simple}). Confira se é isso mesmo ou aplique uma mecânica padrão.`;
  return null;
}
