// Texto da narração (função PURA), gerado SOMENTE a partir dos dados estruturados da campanha:
// nome, gramatura, preço por extenso em pt-BR ("dezoito reais e noventa centavos"), unidade,
// condições e validade. O usuário revisa/edita antes de gerar o vídeo.
import type { RenderCampaign, RenderItem } from "@/domain/campaign";
import type { Unit } from "@/domain/offer";
import type { NarrationSegment } from "./options";
import type { VideoPlan } from "./plan";

const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function below1000(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 20) parts.push(UNITS[r]);
    else parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNITS[r % 10]}` : ""));
  }
  return parts.join(" e ");
}

/** Número inteiro por extenso (pt-BR), até 999.999.999. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("número inválido");
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const groups: string[] = [];
  if (millions) groups.push(millions === 1 ? "um milhão" : `${below1000(millions)} milhões`);
  if (thousands) groups.push(thousands === 1 ? "mil" : `${below1000(thousands)} mil`);
  if (rest) groups.push(below1000(rest));
  if (groups.length === 1) return groups[0];
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda ("mil e cem", "mil e vinte")
  const last = rest || thousands;
  const useE = last < 100 || last % 100 === 0;
  const head = groups.slice(0, -1).join(" ");
  return `${head}${useE ? " e " : " "}${groups[groups.length - 1]}`;
}

/** Centavos por extenso: 1890 → "dezoito reais e noventa centavos"; 90 → "noventa centavos"; 100 → "um real". */
export function spellCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("valor inválido");
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const parts: string[] = [];
  if (reais) {
    const exactMillion = reais >= 1_000_000 && reais % 1_000_000 === 0;
    parts.push(`${numberToWords(reais)} ${exactMillion ? "de reais" : reais === 1 ? "real" : "reais"}`);
  }
  if (c) parts.push(`${numberToWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  if (!parts.length) return "zero real";
  return parts.join(" e ");
}

/** "o quilo", "a unidade"… (preço por unidade). */
export const UNIT_SPOKEN: Record<Unit, string> = {
  un: "a unidade", kg: "o quilo", g: "o grama", "100g": "os cem gramas", l: "o litro", ml: "o mililitro", pct: "o pacote", cx: "a caixa",
  dz: "a dúzia", bdj: "a bandeja", fardo: "o fardo", lata: "a lata", garrafa: "a garrafa", maco: "o maço", par: "o par", m: "o metro", m2: "o metro quadrado",
};
const UNIT_PLURAL: Partial<Record<Unit, string>> = {
  un: "unidades", kg: "quilos", l: "litros", pct: "pacotes", cx: "caixas", dz: "dúzias", bdj: "bandejas", fardo: "fardos", lata: "latas", garrafa: "garrafas", maco: "maços", par: "pares",
};

const SIZE_UNITS: Array<[RegExp, string, string]> = [
  [/^kg$/i, "quilo", "quilos"], [/^g$/i, "grama", "gramas"], [/^ml$/i, "mililitro", "mililitros"], [/^l$/i, "litro", "litros"],
];
/** "Pacote 400g" → "pacote de 400 gramas"; "Garrafa 1,5L" → "garrafa de 1,5 litro". Outros textos ficam como estão. */
export function spokenSize(label: string | null): string | null {
  if (!label?.trim()) return null;
  return label.trim().replace(/^([A-Za-zÀ-ú]+)\s+(\d)/, (_m, w: string, d: string) => `${w.toLocaleLowerCase("pt-BR")} de ${d}`)
    .replace(/(\d+(?:,\d+)?)\s?(kg|g|ml|l)\b/gi, (_m, num: string, u: string) => {
      const def = SIZE_UNITS.find(([re]) => re.test(u))!;
      const one = num === "1" || /^1,/.test(num);
      return `${num} ${one ? def[1] : def[2]}`;
    });
}

/** Frase do preço de um item (somente dados estruturados). */
export function spokenOffer(item: Pick<RenderItem, "offer" | "unit">): string {
  const o = item.offer;
  const per = item.unit ? ` ${UNIT_SPOKEN[item.unit]}` : "";
  const parts: string[] = [];
  switch (o.mode) {
    case "simple": if (o.priceCents != null) parts.push(`${spellCents(o.priceCents)}${per}`); break;
    case "from_to": if (o.priceCents != null && o.regularCents != null) parts.push(`de ${spellCents(o.regularCents)} por ${spellCents(o.priceCents)}${per}`); break;
    case "min_qty": if (o.priceCents != null) parts.push(`a partir de ${o.minQty} ${(item.unit && UNIT_PLURAL[item.unit]) || "unidades"}, ${spellCents(o.priceCents)} cada`); break;
    case "combo": if (o.comboCents != null && o.comboQty) parts.push(`leve ${o.comboQty} por ${spellCents(o.comboCents)}`); break;
    case "club": if (o.priceCents != null && o.clubCents != null) parts.push(`${spellCents(o.priceCents)}${per}, ou ${spellCents(o.clubCents)} no ${o.clubName?.trim() || "clube"}`); break;
  }
  if (o.paymentNote?.trim()) parts.push(o.paymentNote.trim());
  let s = parts.join(", ");
  if (o.limitPerCustomer) s += `. Limite de ${o.limitPerCustomer} por cliente`;
  if (o.conditions?.trim()) s += `. ${o.conditions.trim().replace(/[.!]+$/, "")}`;
  return s;
}

export function spokenItem(item: Pick<RenderItem, "name" | "sizeLabel" | "offer" | "unit">): string {
  const size = spokenSize(item.sizeLabel);
  const head = size ? `${item.name}, ${size}` : item.name;
  const price = spokenOffer(item);
  return `${head}: ${price}.`.replace(/\s+/g, " ");
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "Ofertas válidas de 15/10 a 18/10/2026…" → "Ofertas válidas de 15 de outubro a 18 de outubro…" */
export function spokenValidity(text: string): string {
  return text.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g, (m, d: string, mo: string) => {
    const i = Number(mo) - 1;
    return MONTHS[i] ? `${Number(d)} de ${MONTHS[i]}` : m;
  });
}

/** Texto padrão da narração, uma frase por cena do plano. */
export function defaultNarration(campaign: Pick<RenderCampaign, "title" | "validityText" | "brand" | "items">, plan: Pick<VideoPlan, "scenes">): NarrationSegment[] {
  const byId = new Map(campaign.items.map((i) => [i.id, i]));
  return plan.scenes.map((s) => {
    if (s.kind === "intro") return { key: s.key, text: `${campaign.title}, no ${campaign.brand.storeName}.` };
    if (s.kind === "outro") {
      const parts = [campaign.validityText ? `${spokenValidity(campaign.validityText).replace(/[.!]+$/, "")}.` : ""];
      if (campaign.brand.address) parts.push(`${campaign.brand.storeName}: ${campaign.brand.address.replace(/\s·\s/g, ", ")}.`);
      else parts.push(`${campaign.brand.storeName}.`);
      parts.push("Imagens ilustrativas.");
      return { key: s.key, text: parts.filter(Boolean).join(" ") };
    }
    return { key: s.key, text: s.itemIds.map((id) => byId.get(id)).filter(Boolean).map((i) => spokenItem(i!)).join(" ") };
  });
}

export const NARRATION_MAX_CHARS = 400;
