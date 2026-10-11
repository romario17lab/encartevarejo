import { and, eq } from "drizzle-orm";
import { describeOffer, type Offer, type Unit } from "@/domain/offer";
import type { CampaignItem } from "@/domain/campaign";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { requirePermission } from "../tenant";
import { aiConfig } from "../ai/config";
import { claudeJson, S } from "../ai/claude";
import { AiNotConfiguredError } from "../ai/http";
import { REMOVED_PRICE, stripUnknownPrices } from "../ai/guards";
import { runAiRequest } from "../ai/requests";
import { getCampaignRow } from "./campaigns";
import { loadCampaignParts } from "./campaign-state";

// Sugestões de textos (título, subtítulo, descrições curtas e legenda para WhatsApp/Instagram)
// feitas SOMENTE a partir dos dados estruturados da campanha. O modelo não escreve preços: usa marcadores
// {{oferta:N}} que trocamos pelo texto da oferta gerado de describeOffer/formatBRL (preços exatamente como salvos).
// Depois, qualquer valor em R$ que não seja preço real da campanha é removido e sinalizado.

const MAX_ITEMS_FOR_TEXT = 60;

const SYSTEM = `Você escreve textos curtos de divulgação para encartes de supermercado no Brasil, em português do Brasil, a partir dos dados da campanha fornecidos.

Regras obrigatórias:
- Nunca escreva preços, valores em R$, porcentagens de desconto ou números de preço. Para citar a oferta de um produto, escreva exatamente o marcador {{oferta:N}} (N = número do item na lista). O sistema troca o marcador pelo preço real.
- Para citar o período de validade use {{validade}}; para o nome da loja use {{loja}}. Não escreva datas por conta própria.
- Use somente os produtos da lista. Não invente produtos, marcas, tamanhos, sabores, brindes, frete, parcelamento ou condições.
- Não faça promessas que os dados não sustentam (ex.: "o menor preço da cidade", "estoque garantido").
- title: até 40 caracteres. subtitle: até 80 caracteres.
- descriptions: uma frase curta (até 80 caracteres) para cada item informado, sem preço, com o número do item em n.
- caption: legenda para WhatsApp/Instagram, até 900 caracteres, com no máximo 8 produtos citados com {{oferta:N}}, chamada para visitar a loja e {{validade}} quando houver período. Pode usar poucos emojis.`;

const SCHEMA = S.obj({
  title: S.str(),
  subtitle: S.str(),
  descriptions: S.arr(S.obj({ n: S.int(), text: S.str() })),
  caption: S.str(),
});
interface ModelOut { title: string; subtitle: string; descriptions: Array<{ n: number; text: string }>; caption: string }

const dateSP = (d: Date | null) => d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d) : null;

export function validityPhrase(startsAt: Date | null, endsAt: Date | null, note: string | null): string {
  const s = dateSP(startsAt), e = dateSP(endsAt);
  const base = s && e ? `Ofertas válidas de ${s} a ${e}` : e ? `Ofertas válidas até ${e}` : s ? `Ofertas a partir de ${s}` : "";
  return [base, note].filter(Boolean).join(", ");
}

/** Preços reais (centavos) presentes nas ofertas: únicos valores em R$ aceitos nos textos. */
export function campaignPrices(items: Array<{ offer: Offer }>): Set<number> {
  const set = new Set<number>();
  for (const { offer: o } of items) for (const v of [o.priceCents, o.regularCents, o.comboCents, o.clubCents]) if (v != null) set.add(v);
  return set;
}

/** Troca marcadores pelos dados reais e remove valores em R$ desconhecidos. */
export function fillPlaceholders(text: string, ctx: { items: Array<Pick<CampaignItem, "offer" | "unit" | "name">>; validity: string; store: string; allowed: Set<number> }) {
  const warnings: string[] = [];
  let t = String(text ?? "")
    .replace(/\{\{\s*oferta\s*:\s*(\d+)\s*\}\}/gi, (_m, n: string) => {
      const it = ctx.items[Number(n) - 1];
      if (!it) { warnings.push("Um marcador de oferta inválido foi removido."); return ""; }
      const d = describeOffer(it.offer, (it.unit as Unit | null) ?? null);
      return d || "";
    })
    .replace(/\{\{\s*validade\s*\}\}/gi, ctx.validity)
    .replace(/\{\{\s*loja\s*\}\}/gi, ctx.store)
    .replace(/\{\{[^}]*\}\}/g, "");
  const s = stripUnknownPrices(t, ctx.allowed);
  t = s.text;
  if (s.removed.length) warnings.push(`Valor(es) que não são preços da campanha foram removidos: ${s.removed.join(", ")}. Confira o texto.`);
  if (/\d{1,3}\s*%/.test(t)) warnings.push("O texto cita porcentagem: confira se o desconto está correto.");
  return { text: t.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?])/g, "$1").trim(), warnings };
}

export async function suggestTexts(ctx: TenantCtx, campaignId: string) {
  requirePermission(ctx, "campaigns.write");
  if (!aiConfig().anthropicKey) throw new AiNotConfiguredError("A sugestão de textos");
  const db = getDb();
  const c = await getCampaignRow(ctx, campaignId, db);
  const { items: all } = await loadCampaignParts(db, ctx.orgId, campaignId);
  const items = all.filter((i) => !i.paused).slice(0, MAX_ITEMS_FOR_TEXT);
  if (!items.length) throw new AppError("validation", "Adicione produtos à campanha antes de pedir sugestões de texto.");
  const [store] = await db.select({ name: schema.stores.name }).from(schema.stores).where(and(eq(schema.stores.id, c.storeId), eq(schema.stores.orgId, ctx.orgId)));
  const storeName = store?.name ?? "";
  const validity = validityPhrase(c.startsAt, c.endsAt, c.validityNote);
  const allowed = campaignPrices(items);

  // dados estruturados (sem custo; preços não são enviados — o modelo não precisa deles)
  const data = {
    loja: storeName, campanha: c.name, periodo: validity || "sem período definido",
    itens: items.map((i, idx) => ({
      n: idx + 1, nome: i.name, marca: i.brand, tamanho: i.sizeLabel, categoria: i.category, destaque: i.highlight,
      mecanica: { simple: "preço", from_to: "de/por", min_qty: "a partir de quantidade", combo: "leve X por", club: "preço de clube" }[i.offer.mode],
      condicoes: i.offer.conditions,
    })),
  };
  const cfg = aiConfig();
  const run = await runAiRequest(ctx, {
    kind: "sugerir_textos", provider: "anthropic", model: cfg.model, credits: cfg.credits.sugerir_textos,
    inputSummary: { campaignId, itens: items.length },
  }, async () => {
    const r = await claudeJson<ModelOut>({ system: SYSTEM, content: [{ type: "text", text: `Dados da campanha (JSON):\n${JSON.stringify(data)}` }], schema: SCHEMA, maxTokens: 8000 });
    const fill = (t: string, max: number) => { const f = fillPlaceholders(t, { items, validity, store: storeName, allowed }); return { text: f.text.slice(0, max), warnings: f.warnings }; };
    const title = fill(r.data.title, 60);
    const subtitle = fill(r.data.subtitle, 80);
    const caption = fill(r.data.caption, 1500);
    const descriptions = (Array.isArray(r.data.descriptions) ? r.data.descriptions : [])
      .filter((d) => Number.isInteger(d?.n) && d.n >= 1 && d.n <= items.length)
      .map((d) => { const f = fill(d.text, 120); return { itemId: items[d.n - 1]!.id, name: items[d.n - 1]!.name, text: f.text, warnings: f.warnings }; })
      .filter((d) => d.text);
    const warnings = [...new Set([...title.warnings, ...subtitle.warnings, ...caption.warnings, ...descriptions.flatMap((d) => d.warnings)])];
    const result = {
      title: title.text.replaceAll(REMOVED_PRICE, "").trim(), subtitle: subtitle.text.replaceAll(REMOVED_PRICE, "").trim(),
      caption: caption.text, descriptions: descriptions.map(({ warnings: _w, ...d }) => d), warnings,
    };
    return { result, output: result, model: r.model };
  });
  return { requestId: run.requestId, credits: run.credits, ...run.result, reviewRequired: true as const };
}
