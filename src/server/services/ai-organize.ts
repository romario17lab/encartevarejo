import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { discountPercent } from "@/domain/money";
import type { CampaignItem } from "@/domain/campaign";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { requirePermission } from "../tenant";
import { aiConfig, llmConfigured } from "../ai/config";
import { claudeJson, S } from "../ai/claude";
import { runAiRequest } from "../ai/requests";
import { getCampaignRow } from "./campaigns";
import { loadCampaignParts } from "./campaign-state";

// Organização inicial dos produtos de uma campanha. Tudo que dá para calcular é determinístico:
// destaques = 2–3 maiores descontos calculados dos preços reais; ordem = destaques primeiro e depois por categoria;
// categoria do catálogo quando o item não tem. A IA só sugere NOMES DE CATEGORIA para itens sem categoria.
// Nada é aplicado aqui: o editor mostra cada mudança e o usuário aceita uma a uma.

export type OrganizeChange =
  | { id: string; type: "highlight"; itemId: string; name: string; value: boolean; reason: string; source: "calculo" }
  | { id: string; type: "category"; itemId: string; name: string; value: string; reason: string; source: "catalogo" | "ia" }
  | { id: string; type: "order"; value: string[]; reason: string; source: "calculo" };

/** Desconto real do item (0 quando não há preço de referência informado pelo lojista). */
export function itemDiscount(i: Pick<CampaignItem, "offer">): { pct: number; savingCents: number } {
  const o = i.offer;
  let ref: number | null = null, sale: number | null = null;
  switch (o.mode) {
    case "from_to": case "simple": case "min_qty": ref = o.regularCents; sale = o.priceCents; break;
    case "club": ref = o.priceCents; sale = o.clubCents; break;
    case "combo": ref = o.regularCents != null && o.comboQty ? o.regularCents * o.comboQty : null; sale = o.comboCents; break;
  }
  if (ref == null || sale == null || sale >= ref) return { pct: 0, savingCents: 0 };
  return { pct: discountPercent(ref, sale), savingCents: ref - sale };
}

/** Escolhe os destaques: os 3 maiores descontos (2 se a campanha for pequena; 1 com até 3 itens). */
export function pickHighlights(items: CampaignItem[]): string[] {
  const active = items.filter((i) => !i.paused);
  const max = active.length <= 3 ? 1 : active.length <= 6 ? 2 : 3;
  return active.map((i) => ({ id: i.id, ...itemDiscount(i) })).filter((d) => d.pct > 0)
    .sort((a, b) => b.pct - a.pct || b.savingCents - a.savingCents).slice(0, max).map((d) => d.id);
}

/** Ordem sugerida: destaques primeiro (maior desconto antes), depois grupos por categoria na ordem em que aparecem. */
export function suggestOrder(items: CampaignItem[], highlights: string[], categoryOf: (i: CampaignItem) => string | null): string[] {
  const hl = highlights.filter((id) => items.some((i) => i.id === id));
  const rest = items.filter((i) => !hl.includes(i.id));
  const groups = new Map<string, CampaignItem[]>();
  const none: CampaignItem[] = [];
  for (const i of rest) {
    const c = categoryOf(i)?.trim().toLowerCase();
    if (!c) { none.push(i); continue; }
    groups.set(c, [...(groups.get(c) ?? []), i]);
  }
  return [...hl, ...[...groups.values()].flat().map((i) => i.id), ...none.map((i) => i.id)];
}

const SYSTEM = `Você classifica produtos de supermercado brasileiros em categorias curtas (ex.: Mercearia, Bebidas, Hortifrúti, Açougue, Frios e Laticínios, Padaria, Limpeza, Higiene, Bazar, Pet). Prefira as categorias que a loja já usa. Responda uma categoria para cada item pelo número n. Use somente o nome, marca e tamanho informados; não altere nem complete dados do produto.`;
const SCHEMA = S.obj({ items: S.arr(S.obj({ n: S.int(), category: S.str() })) });

export async function organizeCampaign(ctx: TenantCtx, campaignId: string) {
  requirePermission(ctx, "campaigns.write");
  const db = getDb();
  await getCampaignRow(ctx, campaignId, db);
  const { items } = await loadCampaignParts(db, ctx.orgId, campaignId);
  if (!items.length) throw new AppError("validation", "A campanha ainda não tem produtos para organizar.");
  const changes: OrganizeChange[] = [];
  const notes: string[] = [];

  // 1) destaques por desconto real
  const highlights = pickHighlights(items);
  for (const id of highlights) {
    const it = items.find((i) => i.id === id)!;
    if (!it.highlight) changes.push({ id: `hl:${id}`, type: "highlight", itemId: id, name: it.name, value: true, reason: `Um dos maiores descontos da campanha (${itemDiscount(it).pct}%).`, source: "calculo" });
  }
  if (highlights.length) {
    for (const it of items) if (it.highlight && !highlights.includes(it.id))
      changes.push({ id: `hl:${it.id}`, type: "highlight", itemId: it.id, name: it.name, value: false, reason: itemDiscount(it).pct ? `Desconto menor (${itemDiscount(it).pct}%) que os destaques sugeridos.` : "Sem desconto calculável (falta o preço normal).", source: "calculo" });
  } else notes.push("Nenhum item tem preço normal maior que o preço da oferta: não há desconto para escolher destaques. Informe o preço \"de\" nos itens em oferta.");

  // 2) categoria do catálogo para itens sem categoria
  const newCat = new Map<string, string>();
  const missing = items.filter((i) => !i.category?.trim());
  const pids = missing.map((i) => i.productId).filter((x): x is string => !!x);
  if (pids.length) {
    const rows = await db.select({ id: schema.products.id, category: schema.products.category }).from(schema.products)
      .where(and(eq(schema.products.orgId, ctx.orgId), inArray(schema.products.id, pids), isNotNull(schema.products.category)));
    const byId = new Map(rows.map((r) => [r.id, r.category!]));
    for (const i of missing) {
      const c = i.productId ? byId.get(i.productId) : undefined;
      if (c) { newCat.set(i.id, c); changes.push({ id: `cat:${i.id}`, type: "category", itemId: i.id, name: i.name, value: c, reason: "Categoria do produto no catálogo.", source: "catalogo" }); }
    }
  }

  // 3) IA só para nomes de categoria dos que continuam sem categoria
  const still = missing.filter((i) => !newCat.has(i.id));
  let requestId: string | null = null, credits = 0;
  if (still.length && llmConfigured()) {
    const existingCats = await db.selectDistinct({ c: schema.products.category }).from(schema.products)
      .where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt), isNotNull(schema.products.category))).limit(60);
    const list = still.slice(0, 150);
    const cfg = aiConfig();
    const run = await runAiRequest(ctx, {
      kind: "organizar_produtos", provider: "anthropic", model: cfg.model, credits: cfg.credits.organizar_produtos, inputSummary: { campaignId, itensSemCategoria: list.length },
    }, async () => {
      const text = `Categorias da loja: ${existingCats.map((c) => c.c).join("; ") || "nenhuma"}.\n\nItens:\n${list.map((i, k) => `${k + 1}. ${i.name}${i.brand ? ` | ${i.brand}` : ""}${i.sizeLabel ? ` | ${i.sizeLabel}` : ""}`).join("\n")}`;
      const r = await claudeJson<{ items: Array<{ n: number; category: string }> }>({ system: SYSTEM, content: [{ type: "text", text }], schema: SCHEMA, maxTokens: 4000 });
      const out: Array<{ itemId: string; category: string }> = [];
      for (const x of Array.isArray(r.data?.items) ? r.data.items : []) {
        const it = list[Number(x?.n) - 1];
        const c = String(x?.category ?? "").trim().slice(0, 60);
        if (it && c && !out.some((o) => o.itemId === it.id)) out.push({ itemId: it.id, category: c });
      }
      return { result: out, output: { categories: out }, model: r.model };
    });
    requestId = run.requestId; credits = run.credits;
    for (const { itemId, category } of run.result) {
      const it = items.find((i) => i.id === itemId)!;
      newCat.set(itemId, category);
      changes.push({ id: `cat:${itemId}`, type: "category", itemId, name: it.name, value: category, reason: "Sugestão da IA para item sem categoria.", source: "ia" });
    }
  } else if (still.length) {
    notes.push(`${still.length} item(ns) sem categoria. A sugestão de categorias por IA não está configurada; informe a categoria no item.`);
  }

  // 4) ordem: destaques e grupos por categoria (considera as categorias sugeridas)
  const order = suggestOrder(items, highlights, (i) => newCat.get(i.id) ?? i.category);
  if (order.join() !== items.map((i) => i.id).join())
    changes.push({ id: "order", type: "order", value: order, reason: "Destaques primeiro e produtos agrupados por categoria.", source: "calculo" });
  if (!changes.length) notes.push("A campanha já está organizada: nada a sugerir.");
  return { requestId, credits, changes, notes, aiConfigured: llmConfigured(), reviewRequired: true as const };
}
