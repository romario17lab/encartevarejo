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
