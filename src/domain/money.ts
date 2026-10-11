// Valores monetários são SEMPRE inteiros em centavos (number inteiro seguro).
// Nunca use float para somar, multiplicar ou comparar preços.

export type Cents = number;

export function isValidCents(v: unknown): v is Cents {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

/**
 * Converte texto digitado pelo lojista em centavos.
 * Aceita "4,99", "4.99", "R$ 4,99", "1.234,56", "1234", "0,5".
 * Retorna null quando o texto não é um preço válido.
 */
export function parseBRL(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (!s) return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart = "";
  if (lastComma >= 0 || lastDot >= 0) {
    const sepIdx = Math.max(lastComma, lastDot);
    const sep = s[sepIdx];
    const after = s.slice(sepIdx + 1);
    const before = s.slice(0, sepIdx);
    // "1.234" (ponto como milhar, 3 dígitos depois e sem vírgula) => mil duzentos e trinta e quatro
    if (sep === "." && lastComma < 0 && after.length === 3 && before.length > 0) {
      intPart = s.replace(/\./g, "");
    } else {
      if (after.length > 2) return null;
      decPart = after;
      intPart = before.replace(/[.,]/g, "");
    }
  } else {
    intPart = s;
  }
  if (!/^\d+$/.test(intPart || "0")) return null;
  const cents = Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "R$ 1.234,56" */
export function formatBRL(cents: Cents, opts: { symbol?: boolean } = {}): string {
  const { symbol = true } = opts;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const cent = abs % 100;
  const intStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = `${intStr},${cent.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}${symbol ? "R$ " : ""}${body}`;
}

/** Partes para renderização de preço grande: R$ | 4 | ,99 */
export function priceParts(cents: Cents): { currency: "R$"; integer: string; decimal: string } {
  const reais = Math.floor(cents / 100);
  return {
    currency: "R$",
    integer: reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."),
    decimal: (cents % 100).toString().padStart(2, "0"),
  };
}

/** Percentual de desconto inteiro, arredondado para baixo (nunca exagera o desconto). */
export function discountPercent(fromCents: Cents, toCents: Cents): number {
  if (fromCents <= 0 || toCents >= fromCents) return 0;
  return Math.floor(((fromCents - toCents) * 100) / fromCents);
}

/** Margem sobre o preço de venda em pontos-base (1% = 100). null se custo/preço ausente. */
export function marginBasisPoints(priceCents: Cents, costCents: Cents | null | undefined): number | null {
  if (costCents === null || costCents === undefined || priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) * 10000) / priceCents);
}
