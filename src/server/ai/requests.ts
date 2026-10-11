import { customAlphabet } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { hitRateLimit } from "../auth/rate-limit";
import { assertUsage, getOrgPlan, monthlyUsage, recordUsage } from "../services/plans";
import { aiConfig, backgroundRemovalConfigured, llmConfigured, type AiKind } from "./config";

// Controle de consumo da IA: todo pedido passa por aqui.
// 1) limite de frequência por conta · 2) créditos do plano (assertUsage "ai_credit") ·
// 3) registro em ai_requests (tipo, situação, modelo, créditos, resumo da entrada SEM conteúdo pessoal, saída) ·
// 4) consumo gravado só quando o pedido dá certo (recordUsage). Falhas ficam registradas e não gastam créditos.

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
export const newAiRequestId = () => `aiq_${nano()}`;

export type AiRequestRow = typeof schema.aiRequests.$inferSelect;

export interface RunOpts {
  kind: AiKind;
  provider: string;
  model: string | null;
  credits: number;
  /** resumo da entrada: tamanhos, tipo de arquivo, ids — nunca o texto/imagem em si */
  inputSummary: Record<string, unknown>;
}

export interface RunResult<T> { requestId: string; credits: number; model: string | null; result: T }

export function aiRateLimit(ctx: TenantCtx) {
  hitRateLimit(`ai:org:${ctx.orgId}`, aiConfig().ratePerMinute, 60_000);
}

export async function runAiRequest<T>(ctx: TenantCtx, opts: RunOpts, fn: () => Promise<{ result: T; output: unknown; model?: string | null }>): Promise<RunResult<T>> {
  aiRateLimit(ctx);
  if (opts.credits > 0) await assertUsage(ctx.orgId, "ai_credit", opts.credits);
  const db = getDb();
  const id = newAiRequestId();
  await db.insert(schema.aiRequests).values({
    id, orgId: ctx.orgId, kind: opts.kind, status: "processando", provider: opts.provider, model: opts.model,
    credits: opts.credits, inputSummary: opts.inputSummary, createdBy: ctx.userId,
  });
  try {
    const r = await fn();
    const model = r.model ?? opts.model;
    await db.update(schema.aiRequests).set({ status: "concluida", output: r.output as never, model })
      .where(and(eq(schema.aiRequests.id, id), eq(schema.aiRequests.orgId, ctx.orgId)));
    if (opts.credits > 0) await recordUsage(ctx.orgId, "ai_credit", opts.credits, id);
    return { requestId: id, credits: opts.credits, model, result: r.result };
  } catch (e) {
    const msg = e instanceof AppError ? e.message : "Erro inesperado no pedido à IA.";
    await db.update(schema.aiRequests).set({ status: "falhou", error: msg.slice(0, 300), credits: 0 })
      .where(and(eq(schema.aiRequests.id, id), eq(schema.aiRequests.orgId, ctx.orgId))).catch(() => {});
    throw e;
  }
}

export async function getAiRequest(ctx: TenantCtx, id: string, kind?: AiKind): Promise<AiRequestRow> {
  const [r] = await getDb().select().from(schema.aiRequests).where(and(eq(schema.aiRequests.id, id), eq(schema.aiRequests.orgId, ctx.orgId)));
  if (!r || (kind && r.kind !== kind)) throw notFound("Pedido à IA");
  return r;
}

/** Marca o pedido como revisado (sugestão aceita, total ou parcialmente) ou descartado. */
export async function markAiRequest(ctx: TenantCtx, id: string, status: "revisada" | "descartada", kind?: AiKind) {
  const r = await getAiRequest(ctx, id, kind);
  if (r.status === "processando" || r.status === "falhou") throw new AppError("conflict", "Este pedido não tem resultado para revisar.");
  if (r.status === status) return { ok: true, status };
  if (r.status !== "concluida") throw new AppError("conflict", "Este pedido já foi revisado.");
  await getDb().update(schema.aiRequests).set({ status, reviewedBy: ctx.userId, reviewedAt: new Date() })
    .where(and(eq(schema.aiRequests.id, id), eq(schema.aiRequests.orgId, ctx.orgId)));
  return { ok: true, status };
}

export const KIND_LABEL: Record<AiKind, string> = {
  extrair_lista: "Extração de lista",
  remover_fundo: "Remoção de fundo",
  sugerir_textos: "Sugestão de textos",
  sugerir_campanha: "Sugestão de campanhas",
  organizar_produtos: "Organização de produtos",
};

/** Situação da IA na conta: integrações configuradas e créditos do mês. */
export async function aiStatus(ctx: TenantCtx) {
  const plan = await getOrgPlan(ctx.orgId);
  const usage = await monthlyUsage(ctx.orgId);
  const cfg = aiConfig();
  return {
    configured: { llm: llmConfigured(), backgroundRemoval: backgroundRemovalConfigured() },
    model: llmConfigured() ? cfg.model : null,
    credits: { used: usage.aiCreditsThisMonth, limit: plan.limits.aiCreditsPerMonth, planName: plan.name, perRequest: cfg.credits },
  };
}

/** Histórico de pedidos da conta (mais recentes primeiro). Sem a saída completa, só o essencial. */
export async function listAiRequests(ctx: TenantCtx, limit = 50) {
  const rows = await getDb().select({ r: schema.aiRequests, userName: schema.users.name }).from(schema.aiRequests)
    .leftJoin(schema.users, eq(schema.users.id, schema.aiRequests.createdBy))
    .where(eq(schema.aiRequests.orgId, ctx.orgId)).orderBy(desc(schema.aiRequests.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(({ r, userName }) => ({
    id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind] ?? r.kind, status: r.status, provider: r.provider, model: r.model,
    credits: r.credits, inputSummary: r.inputSummary, error: r.error, createdAt: r.createdAt, reviewedAt: r.reviewedAt, createdByName: userName ?? null,
  }));
}
