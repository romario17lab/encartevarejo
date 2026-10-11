import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { requirePermission } from "../tenant";
import { aiConfig } from "../ai/config";
import { claudeJson, S } from "../ai/claude";
import { AiNotConfiguredError } from "../ai/http";
import { getAiRequest, runAiRequest } from "../ai/requests";
import { isValidYmd, listCalendarEvents } from "./calendar-events";
import { createCampaign, listCampaigns } from "./campaigns";

// Sugestões de campanhas: cruza o calendário comercial (datas globais + eventos da conta) com o catálogo
// e sugere temas, janelas de datas, categorias e produtos JÁ CADASTRADOS que combinam. Nenhum preço é sugerido:
// "Criar rascunho" usa os preços do catálogo (createCampaign) e o lojista revisa tudo no editor.

const MAX_CATALOG = 400;
const MAX_IDEAS = 5;
const MAX_PRODUCTS_PER_IDEA = 40;

const SYSTEM = `Você ajuda supermercados brasileiros a planejar campanhas de ofertas. Com base nas datas comerciais e no catálogo fornecidos, sugira até ${MAX_IDEAS} ideias de campanha para o período.

Regras obrigatórias:
- Use apenas produtos do catálogo, citando-os pelo código (ex.: "P12"). Nunca invente produtos.
- Nunca sugira preços, descontos ou porcentagens.
- startDate e endDate no formato AAAA-MM-DD, dentro do período informado, com no máximo 15 dias de duração; normalmente terminando no dia da data comercial.
- eventName: o nome exato de uma data comercial da lista, ou null para campanhas sem data específica (ex.: "Semana do hortifrúti").
- categories: categorias de supermercado envolvidas (curtas).
- rationale: uma frase curta em português explicando a ideia.
- Evite repetir campanhas que a loja já tem no período (lista fornecida).`;

const SCHEMA = S.obj({
  ideas: S.arr(S.obj({
    theme: S.str(), eventName: S.nullableStr(), startDate: S.str(), endDate: S.str(),
    categories: S.arr(S.str()), productRefs: S.arr(S.str()), rationale: S.str(),
  })),
});
interface ModelOut { ideas: Array<{ theme: string; eventName: string | null; startDate: string; endDate: string; categories: string[]; productRefs: string[]; rationale: string }> }

function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export interface CampaignIdea {
  theme: string; eventName: string | null; startDate: string; endDate: string; categories: string[]; rationale: string;
  products: Array<{ id: string; name: string; sizeLabel: string | null; category: string | null; hasPrice: boolean }>;
}

/** Valida e limpa as ideias do modelo (datas reais dentro da janela, só produtos existentes). */
export function sanitizeIdeas(out: ModelOut, opts: { from: string; to: string; events: string[]; refs: Map<string, CampaignIdea["products"][number]> }): CampaignIdea[] {
  const ideas: CampaignIdea[] = [];
  for (const i of (Array.isArray(out?.ideas) ? out.ideas : []).slice(0, MAX_IDEAS)) {
    const theme = String(i?.theme ?? "").trim().slice(0, 80);
    if (!theme) continue;
    let start = String(i.startDate ?? ""), end = String(i.endDate ?? "");
    if (!isValidYmd(start) || !isValidYmd(end)) continue;
    if (start < opts.from) start = opts.from;
    if (end > opts.to) end = opts.to;
    if (end < start || daysBetween(start, end) > 31) continue;
    const seen = new Set<string>();
    const products = (Array.isArray(i.productRefs) ? i.productRefs : []).map((r) => String(r).trim().toUpperCase())
      .filter((r) => opts.refs.has(r) && !seen.has(r) && seen.add(r)).slice(0, MAX_PRODUCTS_PER_IDEA).map((r) => opts.refs.get(r)!);
    ideas.push({
      theme, eventName: i.eventName && opts.events.includes(i.eventName) ? i.eventName : null, startDate: start, endDate: end,
      categories: (Array.isArray(i.categories) ? i.categories : []).map((c) => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, 8),
      rationale: String(i.rationale ?? "").trim().slice(0, 240), products,
    });
  }
  return ideas;
}

export async function suggestCampaignIdeas(ctx: TenantCtx, raw: unknown = {}) {
  requirePermission(ctx, "campaigns.write");
  if (!aiConfig().anthropicKey) throw new AiNotConfiguredError("A sugestão de campanhas");
  const { days } = z.object({ days: z.number().int().min(7).max(120).default(60) }).parse(raw ?? {});
  const from = todaySP();
  const to = addDaysYmd(from, days);
  const events = await listCalendarEvents(ctx, from, to);
  const products = await getDb().select({
    id: schema.products.id, name: schema.products.name, brand: schema.products.brand, sizeLabel: schema.products.sizeLabel, category: schema.products.category,
    regularCents: schema.products.regularCents, promoCents: schema.products.promoCents,
  }).from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt)))
    .orderBy(asc(schema.products.category), asc(schema.products.normalizedName)).limit(MAX_CATALOG);
  if (!products.length) throw new AppError("validation", "Cadastre produtos no catálogo para receber sugestões de campanha.");
  const refs = new Map(products.map((p, i) => [`P${i + 1}`, { id: p.id, name: p.name, sizeLabel: p.sizeLabel, category: p.category, hasPrice: p.regularCents != null || p.promoCents != null }]));
  const existing = (await listCampaigns(ctx, { from: `${from}T00:00:00-03:00`, to: `${to}T23:59:59-03:00`, limit: 30 })).map((c) => c.name);

  // catálogo sem preços nem custo: o modelo não precisa de valores para sugerir temas
  const catalog = products.map((p, i) => `P${i + 1} | ${p.name}${p.brand ? ` | ${p.brand}` : ""}${p.sizeLabel ? ` | ${p.sizeLabel}` : ""} | ${p.category ?? "sem categoria"}`).join("\n");
  const prompt = [
    `Período: ${from} a ${to}.`,
    `Datas comerciais no período:\n${events.map((e) => `- ${e.date}: ${e.name}${e.note ? ` (${e.note})` : ""}`).join("\n") || "- nenhuma"}`,
    `Campanhas já existentes no período: ${existing.join("; ") || "nenhuma"}.`,
    `Catálogo (código | nome | marca | tamanho | categoria):\n${catalog}`,
  ].join("\n\n");

  const cfg = aiConfig();
  const run = await runAiRequest(ctx, {
    kind: "sugerir_campanha", provider: "anthropic", model: cfg.model, credits: cfg.credits.sugerir_campanha,
    inputSummary: { de: from, ate: to, datas: events.length, produtos: products.length },
  }, async () => {
    const r = await claudeJson<ModelOut>({ system: SYSTEM, content: [{ type: "text", text: prompt }], schema: SCHEMA, maxTokens: 8000 });
    const ideas = sanitizeIdeas(r.data, { from, to, events: events.map((e) => e.name), refs });
    return { result: ideas, output: { ideas }, model: r.model };
  });
  return { requestId: run.requestId, credits: run.credits, from, to, ideas: run.result, reviewRequired: true as const };
}

const draftSchema = z.object({
  requestId: z.string().min(1),
  storeId: z.string().min(1, "Escolha a loja."),
  name: z.string().trim().min(1, "Dê um nome para a campanha.").max(120),
  startDate: z.string().refine(isValidYmd, "Data inicial inválida."),
  endDate: z.string().refine(isValidYmd, "Data final inválida."),
  productIds: z.array(z.string()).max(MAX_PRODUCTS_PER_IDEA).default([]),
});

/** "Criar rascunho": campanha em rascunho com as datas e os produtos escolhidos, com preços do catálogo. */
export async function createDraftFromIdea(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = draftSchema.parse(raw);
  if (input.endDate < input.startDate) throw new AppError("validation", "A data final precisa ser igual ou posterior à inicial.");
  const req = await getAiRequest(ctx, input.requestId, "sugerir_campanha");
  if (req.status === "processando" || req.status === "falhou") throw new AppError("conflict", "Esta sugestão não está disponível.");
  const state = await createCampaign(ctx, {
    storeId: input.storeId, name: input.name, startsAt: `${input.startDate}T00:00:00-03:00`, endsAt: `${input.endDate}T23:59:59-03:00`, productIds: input.productIds,
  });
  if (req.status === "concluida") {
    await getDb().update(schema.aiRequests).set({ status: "revisada", reviewedBy: ctx.userId, reviewedAt: new Date() })
      .where(and(eq(schema.aiRequests.id, req.id), eq(schema.aiRequests.orgId, ctx.orgId)));
  }
  return { campaignId: state.campaign.id };
}
