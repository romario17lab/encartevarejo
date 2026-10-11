import { z } from "zod";
import { type Cents, discountPercent, formatBRL } from "./money";

// ---------- Unidades ----------
export const UNITS = {
  un: { label: "unidade", short: "un" },
  kg: { label: "quilo", short: "kg" },
  g: { label: "grama", short: "g" },
  "100g": { label: "100 gramas", short: "100g" },
  l: { label: "litro", short: "L" },
  ml: { label: "mililitro", short: "ml" },
  pct: { label: "pacote", short: "pct" },
  cx: { label: "caixa", short: "cx" },
  dz: { label: "dúzia", short: "dz" },
  bdj: { label: "bandeja", short: "bdj" },
  fardo: { label: "fardo", short: "fardo" },
  lata: { label: "lata", short: "lata" },
  garrafa: { label: "garrafa", short: "gfa" },
  maco: { label: "maço", short: "maço" },
  par: { label: "par", short: "par" },
  m: { label: "metro", short: "m" },
  m2: { label: "metro quadrado", short: "m²" },
} as const;
export type Unit = keyof typeof UNITS;
export const unitSchema = z.enum(Object.keys(UNITS) as [Unit, ...Unit[]]);

// ---------- Mecânicas de preço ----------
// simple:   "R$ 4,99"
// from_to:  "De R$ 6,99 por R$ 4,99" (preço anterior SEMPRE informado pelo lojista)
// min_qty:  "A partir de 3 un, R$ 4,49 cada" (preço normal em regularCents, opcional)
// combo:    "Leve 3 por R$ 12,00" (comboQty + comboCents)
// club:     preço normal + preço de clube informado ("Clube: R$ 4,49")
export const PRICE_MODES = ["simple", "from_to", "min_qty", "combo", "club"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

const cents = z.number().int().nonnegative().max(100_000_000);

export const offerSchema = z.object({
  mode: z.enum(PRICE_MODES),
  /** Preço anunciado principal (por/oferta). Obrigatório em todas as mecânicas, exceto combo. */
  priceCents: cents.nullable(),
  /** Preço normal / "de". Obrigatório em from_to; opcional nas demais. */
  regularCents: cents.nullable().default(null),
  minQty: z.number().int().min(2).max(999).nullable().default(null),
  comboQty: z.number().int().min(2).max(999).nullable().default(null),
  comboCents: cents.nullable().default(null),
  clubCents: cents.nullable().default(null),
  clubName: z.string().max(40).nullable().default(null),
  limitPerCustomer: z.number().int().min(1).max(999).nullable().default(null),
  paymentNote: z.string().max(80).nullable().default(null), // ex.: "à vista", "no Pix"
  conditions: z.string().max(160).nullable().default(null), // texto livre: "Válido para a marca X"
});
export type Offer = z.infer<typeof offerSchema>;

export type OfferIssue = { field: keyof Offer | "unit" | "dates"; level: "error" | "warning"; message: string };

/** Valida uma oferta. Erros bloqueiam aprovação/exportação; avisos apenas alertam. */
export function validateOffer(o: Offer, opts: { unit?: Unit | null; minMarginBp?: number | null; costCents?: Cents | null } = {}): OfferIssue[] {
  const issues: OfferIssue[] = [];
  const err = (field: OfferIssue["field"], message: string) => issues.push({ field, level: "error", message });
  const warn = (field: OfferIssue["field"], message: string) => issues.push({ field, level: "warning", message });

  if (!opts.unit) err("unit", "Informe a unidade (un, kg, L...).");

  if (o.mode !== "combo") {
    if (o.priceCents === null) err("priceCents", "Informe o preço da oferta.");
    else if (o.priceCents === 0) err("priceCents", "O preço não pode ser zero.");
  }
  switch (o.mode) {
    case "from_to":
      if (o.regularCents === null) err("regularCents", "Informe o preço anterior (\"de\").");
      else if (o.priceCents !== null && o.regularCents <= o.priceCents)
        err("regularCents", "O preço anterior precisa ser maior que o preço da oferta.");
      break;
    case "min_qty":
      if (!o.minQty) err("minQty", "Informe a quantidade mínima.");
      break;
    case "combo":
      if (!o.comboQty) err("comboQty", "Informe quantas unidades formam o combo.");
      if (o.comboCents === null || o.comboCents === 0) err("comboCents", "Informe o preço do combo.");
      if (o.comboQty && o.comboCents && o.regularCents && o.comboCents >= o.regularCents * o.comboQty)
        err("comboCents", "O combo precisa sair mais barato que comprar as unidades pelo preço normal.");
      break;
    case "club":
      if (o.clubCents === null || o.clubCents === 0) err("clubCents", "Informe o preço de clube.");
      else if (o.priceCents !== null && o.clubCents >= o.priceCents)
        err("clubCents", "O preço de clube precisa ser menor que o preço normal.");
      break;
  }
  if (o.regularCents !== null && o.priceCents !== null && o.mode !== "from_to" && o.regularCents < o.priceCents)
    warn("regularCents", "O preço normal está menor que o preço anunciado.");
  if (o.mode === "from_to" && o.regularCents && o.priceCents) {
    const pct = discountPercent(o.regularCents, o.priceCents);
    if (pct >= 80) warn("priceCents", `Desconto de ${pct}% parece alto demais. Confira os valores.`);
  }
  if (opts.costCents != null && opts.minMarginBp != null) {
    const sale = o.mode === "combo" && o.comboCents && o.comboQty ? Math.floor(o.comboCents / o.comboQty) : o.mode === "club" ? o.clubCents : o.priceCents;
    if (sale != null && sale > 0) {
      const bp = Math.round(((sale - opts.costCents) * 10000) / sale);
      if (bp < opts.minMarginBp) warn("priceCents", `Margem de ${(bp / 100).toFixed(1).replace(".", ",")}% abaixo do mínimo configurado.`);
    }
  }
  return issues;
}

/** Valor que identifica "o preço" desta oferta para consistência entre peças. */
export function offerFingerprint(o: Offer): string {
  return JSON.stringify([o.mode, o.priceCents, o.regularCents, o.minQty, o.comboQty, o.comboCents, o.clubCents, o.clubName, o.limitPerCustomer, o.paymentNote, o.conditions]);
}

/** Texto acessível/plain da oferta (usado em vitrine, alt-text, WhatsApp). */
export function describeOffer(o: Offer, unit: Unit | null): string {
  const u = unit ? UNITS[unit].short : "";
  const per = u ? `/${u}` : "";
  const parts: string[] = [];
  switch (o.mode) {
    case "simple": if (o.priceCents != null) parts.push(`${formatBRL(o.priceCents)}${per}`); break;
    case "from_to": if (o.regularCents != null && o.priceCents != null) parts.push(`De ${formatBRL(o.regularCents)} por ${formatBRL(o.priceCents)}${per}`); break;
    case "min_qty": if (o.priceCents != null) parts.push(`A partir de ${o.minQty} ${u}: ${formatBRL(o.priceCents)}${per} cada`); break;
    case "combo": if (o.comboCents != null) parts.push(`Leve ${o.comboQty} por ${formatBRL(o.comboCents)}`); break;
    case "club": if (o.priceCents != null && o.clubCents != null) parts.push(`${formatBRL(o.priceCents)}${per} | ${o.clubName || "Clube"}: ${formatBRL(o.clubCents)}${per}`); break;
  }
  if (o.limitPerCustomer) parts.push(`Limite de ${o.limitPerCustomer} por cliente`);
  if (o.paymentNote) parts.push(o.paymentNote);
  if (o.conditions) parts.push(o.conditions);
  return parts.join(" · ");
}

export const emptyOffer = (): Offer => ({
  mode: "simple", priceCents: null, regularCents: null, minQty: null, comboQty: null, comboCents: null,
  clubCents: null, clubName: null, limitPerCustomer: null, paymentNote: null, conditions: null,
});
