// Linhas de exibição da oferta para os modelos v2 (todas as mecânicas de src/domain/offer.ts).
// Nunca inventa valores: campos ausentes ficam ausentes. Desconto só com preço anterior informado.
import { describeOffer, UNITS, type Offer, type Unit } from "@/domain/offer";
import { discountPercent, formatBRL } from "@/domain/money";

const MEASURE = new Set<Unit>(["kg", "g", "100g", "l", "ml", "m", "m2"]);

/** Sufixo ao lado do preço: "/kg", "un", "cada"... */
export function unitSuffix2(unit: Unit | null, mode: Offer["mode"]): string | null {
  if (!unit) return mode === "min_qty" ? "cada" : null;
  if (MEASURE.has(unit)) return `/${UNITS[unit].short}`;
  if (mode === "min_qty") return "cada";
  return UNITS[unit].short;
}

export interface PriceModel2 {
  mode: Offer["mode"];
  cents: number | null;
  suffix: string | null;
  /** aba acima da placa: "POR", "LEVE 3 POR", nome do clube, "A PARTIR DE 6 UN" */
  tab: string | null;
  /** preço anterior riscado (somente de/por) */
  old: { label: string; value: string } | null;
  subs: Array<{ text: string; short: string }>;
  extras: string[];
  discount: number;
  aria: string;
}

export function priceModel2(offer: Offer, unit: Unit | null): PriceModel2 {
  const sfx = unitSuffix2(unit, offer.mode);
  const count = unit ? UNITS[unit].short : "un";
  const m: PriceModel2 = { mode: offer.mode, cents: offer.priceCents, suffix: sfx, tab: null, old: null, subs: [], extras: [], discount: 0, aria: describeOffer(offer, unit) };
  switch (offer.mode) {
    case "simple":
      break;
    case "from_to":
      if (offer.regularCents != null) {
        m.tab = "POR";
        m.old = { label: "DE", value: formatBRL(offer.regularCents) };
        if (offer.priceCents != null) m.discount = discountPercent(offer.regularCents, offer.priceCents);
      }
      break;
    case "min_qty":
      if (offer.minQty) m.tab = `A PARTIR DE ${offer.minQty} ${count.toLocaleUpperCase("pt-BR")}`;
      if (offer.regularCents != null) m.subs.push({ text: `Preço normal ${formatBRL(offer.regularCents)}`, short: `Normal ${formatBRL(offer.regularCents)}` });
      break;
    case "combo":
      m.cents = offer.comboCents;
      m.suffix = null;
      if (offer.comboQty) m.tab = `LEVE ${offer.comboQty} POR`;
      if (offer.comboCents != null && offer.comboQty && offer.comboCents % offer.comboQty === 0)
        m.subs.push({ text: `Sai ${formatBRL(offer.comboCents / offer.comboQty)} cada`, short: `${formatBRL(offer.comboCents / offer.comboQty)} cada` });
      if (offer.regularCents != null) m.subs.push({ text: `Unidade ${formatBRL(offer.regularCents)}`, short: `Un. ${formatBRL(offer.regularCents)}` });
      break;
    case "club": {
      m.cents = offer.clubCents;
      m.tab = (offer.clubName?.trim() || "Preço de clube").toLocaleUpperCase("pt-BR");
      if (offer.priceCents != null) {
        const per = sfx && sfx.startsWith("/") ? sfx : "";
        m.subs.push({ text: `Preço normal ${formatBRL(offer.priceCents)}${per}`, short: `Normal ${formatBRL(offer.priceCents)}${per}` });
      }
      break;
    }
  }
  if (offer.limitPerCustomer) m.extras.push(`Limite de ${offer.limitPerCustomer} por cliente`);
  if (offer.paymentNote) m.extras.push(offer.paymentNote);
  if (offer.conditions) m.extras.push(offer.conditions);
  return m;
}
