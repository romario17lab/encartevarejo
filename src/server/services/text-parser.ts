import { parseBRL } from "@/domain/money";
import type { Unit } from "@/domain/offer";

// Parser determinístico de listas de produtos coladas como texto (WhatsApp, planilha, bloco de notas).
// Regra: nunca inventar. O que não for reconhecido fica null e gera um aviso para revisão humana.

export interface ParsedTextRow {
  line: number;
  raw: string;
  name: string | null;
  sizeLabel: string | null;
  unit: Unit | null;
  /** sugestão (não aplicada) para o usuário confirmar, ex.: "un" para itens embalados */
  suggestedUnit: Unit | null;
  priceCents: number | null;
  /** preço anterior apenas quando a linha diz explicitamente "de X por Y" */
  regularCents: number | null;
  issues: string[];
}

const UNIT_WORDS: Record<string, Unit> = {
  kg: "kg", quilo: "kg", un: "un", und: "un", unid: "un", unidade: "un", cada: "un",
  pct: "pct", pacote: "pct", cx: "cx", caixa: "cx", dz: "dz", duzia: "dz", "dúzia": "dz",
  bdj: "bdj", bandeja: "bdj", lata: "lata", garrafa: "garrafa", fardo: "fardo", "maço": "maco", maco: "maco",
};
const UNIT_WORD_RE = "kg|quilo|un|und|unid|unidade|pct|pacote|cx|caixa|dz|d[uú]zia|bdj|bandeja|lata|garrafa|fardo|ma[cç]o";

// preço: "R$ 9,99", "R$9", "24,90", "1.234,56", "9.99" — sem letra colada depois (senão é tamanho: "1,50kg")
const PRICE_RE = new RegExp(
  String.raw`(?<![\w.,])(R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|R\$\s*\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?![\d.,]*\d)(?![A-Za-zÀ-ú])` +
  String.raw`(\s*(?:\/|\bo\b|\bpor\b)?\s*(?:${UNIT_WORD_RE})\b|\s*cada\b)?`, "giu");
const SIZE_RE = /(?<![\w.,])(\d+(?:[.,]\d+)?)\s?(kg|g|gr|grs|mg|ml|l|lt|litros?|cl)(?![A-Za-zÀ-ú])/iu;
const UNIT_TOKEN_RE = new RegExp(String.raw`(?<![\wÀ-ú])(?:\/\s*)?(${UNIT_WORD_RE})(?![\wÀ-ú])`, "iu");

function unitFromWord(w: string): Unit | null {
  const k = w.toLowerCase().replace(/^\/\s*/, "").trim();
  return UNIT_WORDS[k] ?? UNIT_WORDS[k.normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? null;
}

function normalizeSize(num: string, u: string): string {
  const unit = u.toLowerCase();
  const map: Record<string, string> = { gr: "g", grs: "g", l: "L", lt: "L", litro: "L", litros: "L" };
  return `${num.replace(".", ",")}${map[unit] ?? unit}`;
}

function cleanName(s: string): string {
  return s.replace(/\s+[-–—|:]+\s*/g, " ").replace(/^[\s\-–—•*·|:]+|[\s\-–—•*·|:,;]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

export function parseProductLine(raw: string, line: number): ParsedTextRow | null {
  let text = raw.replace(/\t/g, " ").trim();
  if (!text || /^[\s\-=_*.•]+$/.test(text)) return null;
  text = text.replace(/^(?:[-•*·]+|\d{1,3}[.)])\s+/, "");
  const issues: string[] = [];

  if (/\bleve\s+\d+\s+pague\s+\d+\b/i.test(text)) {
    issues.push("Mecânica \"leve X pague Y\" não é convertida automaticamente. Configure a oferta (combo) na revisão.");
    text = text.replace(/\bleve\s+\d+\s+pague\s+\d+\b/i, " ");
  } else if (/\bleve\s+\d+\b/i.test(text)) {
    issues.push("Oferta de quantidade (\"leve...\") não é convertida automaticamente. Configure a mecânica na revisão.");
  }

  // preços
  const prices: Array<{ cents: number | null; unit: Unit | null; index: number; match: string }> = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const numTxt = m[1]!;
    const cents = parseBRL(numTxt.replace(/^R\$\s*/i, ""));
    const suffix = m[2]?.trim() ?? "";
    const word = suffix.replace(/^(\/|o\s|por\s)/i, "").trim();
    prices.push({ cents, unit: suffix ? unitFromWord(word) : null, index: m.index!, match: m[0] });
  }
  let priceCents: number | null = null;
  let regularCents: number | null = null;
  let priceUnit: Unit | null = null;
  let fromTo = false;
  if (prices.length === 1) {
    priceCents = prices[0]!.cents; priceUnit = prices[0]!.unit;
  } else if (prices.length === 2 && /\bde\b[^]*\bpor\b/i.test(text)) {
    regularCents = prices[0]!.cents; priceCents = prices[1]!.cents; priceUnit = prices[1]!.unit ?? prices[0]!.unit;
    fromTo = true;
    if (regularCents !== null && priceCents !== null && regularCents <= priceCents) issues.push("O preço \"de\" não é maior que o preço \"por\". Confira.");
  } else if (prices.length > 1) {
    issues.push("Mais de um preço na linha. Informe o preço correto na revisão.");
  }
  for (const p of [...prices].sort((a, b) => b.index - a.index)) text = text.slice(0, p.index) + " " + text.slice(p.index + p.match.length);
  if (fromTo) text = text.replace(/\bde\s+por\s*$/i, " ").replace(/^\s*de\s+por\b/i, " ").replace(/\bde\s+por\b/i, " ");
  const weakPriceUnit = prices.length > 0 && /cada\s*$/i.test(prices[prices.length - 1]!.match);
  if (priceCents === 0) issues.push("Preço igual a zero. Confira.");

  // tamanho/gramatura
  let sizeLabel: string | null = null;
  const sm = text.match(SIZE_RE);
  if (sm) {
    sizeLabel = normalizeSize(sm[1]!, sm[2]!);
    text = text.slice(0, sm.index!) + " " + text.slice(sm.index! + sm[0].length);
  }

  // unidade solta ("Banana prata kg", "Ovos dz")
  let unit: Unit | null = priceUnit;
  const um = text.match(UNIT_TOKEN_RE);
  if (um) {
    const u = unitFromWord(um[1]!);
    if (u && unit && weakPriceUnit) unit = u;
    else if (u && unit && u !== unit) issues.push(`Unidades diferentes na linha (${u} e ${unit}). Confira.`);
    unit = unit ?? u;
    text = text.slice(0, um.index!) + " " + text.slice(um.index! + um[0].length);
  }
  text = text.replace(/R\$\s*/gi, " ");

  const name = cleanName(text) || null;
  if (!name) issues.push("Nome do produto não encontrado.");
  if (priceCents === null && !issues.some((i) => i.startsWith("Mais de um preço"))) issues.push("Preço não encontrado: informe o preço.");
  let suggestedUnit: Unit | null = null;
  if (!unit) {
    issues.push("Unidade não informada: confira (un, kg, L...).");
    if (sizeLabel) suggestedUnit = "un";
  }
  return { line, raw: raw.trim(), name, sizeLabel, unit, suggestedUnit, priceCents, regularCents, issues };
}

export function parseProductText(text: string): { rows: ParsedTextRow[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").slice(0, 2000);
  const rows: ParsedTextRow[] = [];
  lines.forEach((l, i) => { const r = parseProductLine(l, i + 1); if (r) rows.push(r); });
  return { rows };
}
