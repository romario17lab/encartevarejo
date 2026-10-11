import { parseBRL } from "@/domain/money";
import { normalizeName } from "../text";

// Travas contra invenção: a IA nunca é fonte de preço, unidade, marca ou produto.
// Tudo que sai do modelo é conferido aqui contra a fonte (texto colado) ou contra os dados estruturados.

const NUM_RE = /(?<![\d])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])/g;

/** Todos os valores numéricos (em centavos) que aparecem literalmente no texto. */
export function numbersInText(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(NUM_RE)) {
    const raw = m[1]!;
    const c = parseBRL(raw);
    if (c != null) out.add(c);
    // "1.234" pode ser milhar ou 1,234: aceita as duas leituras só para a conferência literal
    if (/^\d+\.\d{1,2}$/.test(raw)) { const alt = parseBRL(raw.replace(".", ",")); if (alt != null) out.add(alt); }
  }
  return out;
}

/** Os dígitos do preço (em qualquer grafia comum) aparecem literalmente no texto-fonte? */
export function priceAppearsInText(cents: number, source: string | Set<number>): boolean {
  const set = typeof source === "string" ? numbersInText(source) : source;
  return set.has(cents);
}

/** Converte o texto de preço devolvido pelo modelo ("24,90", "R$ 7,49") em centavos. */
export function priceTextToCents(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/^R\$\s*/i, "");
  if (!s) return null;
  const c = parseBRL(s);
  return c != null && c > 0 && c <= 100_000_000 ? c : null;
}

/** Palavras significativas de `needle` (>= 3 letras) presentes no texto-fonte, de 0 a 1. */
export function wordCoverage(needle: string, source: string): number {
  const src = ` ${normalizeName(source)} `;
  const words = normalizeName(needle).split(" ").filter((w) => w.length >= 3 || /\d/.test(w));
  if (!words.length) return 1;
  return words.filter((w) => src.includes(` ${w} `) || src.includes(w)).length / words.length;
}

/** Texto aparece (normalizado) dentro da fonte. */
export function appearsIn(needle: string, source: string): boolean {
  const n = normalizeName(needle);
  return !!n && normalizeName(source).includes(n);
}

// ---------- Valores em reais dentro de textos gerados ----------
const MONEY_RE = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|R\$\s*\d+(?:[.,]\d{1,2})?|(?<![\d.,])\d+,\d{2}(?![\d])/gi;

export function moneyMentions(text: string): Array<{ match: string; cents: number | null; index: number }> {
  return [...text.matchAll(MONEY_RE)].map((m) => ({ match: m[0], cents: parseBRL(m[0].replace(/^R\$\s*/i, "")), index: m.index! }));
}

export const REMOVED_PRICE = "[preço removido]";

/**
 * Remove de um texto gerado qualquer valor em R$ que não seja um preço real da campanha.
 * Devolve o texto limpo e a lista dos valores removidos (para avisar o usuário).
 */
export function stripUnknownPrices(text: string, allowed: Set<number>): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = text.replace(MONEY_RE, (m) => {
    const c = parseBRL(m.replace(/^R\$\s*/i, ""));
    if (c != null && allowed.has(c)) return m;
    removed.push(m.trim());
    return REMOVED_PRICE;
  });
  return { text: out, removed };
}
