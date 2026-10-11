// Assinatura da conta: ciclo de vida, direitos de uso (entitlements), ações do cliente e webhooks.
//
// Ciclo: teste (BILLING_TRIAL_DAYS, padrão 14) → ativa → inadimplente (falha de pagamento; carência de
// BILLING_GRACE_DAYS, padrão 7) → cancelada (cancelamento agendado para o fim do período) → encerrada.
//
// Política de acesso (documentada em README › Cobrança):
// - encerrada, inadimplente após a carência, cancelada após o fim do período e conta suspensa → SOMENTE LEITURA:
//   consultar, exportar os dados da conta, excluir a conta, entrar/sair e cuidar da cobrança continuam liberados.
// - teste vencido → somente leitura apenas quando há pagamento online configurado (para o cliente poder assinar);
//   sem provedor (modo "manual"), a conta segue editável e a equipe de suporte ativa o plano.
// - reembolso TOTAL encerra o acesso na hora (status encerrada); reembolso parcial só é registrado.
//   Um pagamento posterior confirmado (invoice.paid) restaura o acesso.
// - Conta sem linha de assinatura (dados anteriores à Etapa 4) = manual/ativa.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import type { TenantCtx } from "../context";
import { can } from "@/domain/campaign";
import { getDb, schema } from "../db";
import type { Executor, Tx } from "../db/tx";
import { AppError, forbidden } from "../errors";
import { appUrl } from "../email";
import { writeAudit } from "../audit";
import { billingConfig, getBillingProvider, webhookProvider, type BillingProvider, type ProviderName, type ProviderSubscription, type WebhookEvent } from "../billing";
import { PAYMENT_NOT_ENABLED } from "../billing/manual";
import { FEATURE_LABEL, listActivePlans, monthlyUsage, orgUsage } from "./plans";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
const subId = () => `sub_${nano()}`;
const eventId = () => `bev_${nano()}`;

export type SubscriptionStatus = (typeof schema.subscriptionStatusEnum.enumValues)[number];
type SubRow = typeof schema.subscriptions.$inferSelect;

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  teste: "Período de teste",
  ativa: "Ativa",
  inadimplente: "Pagamento pendente",
  cancelada: "Cancelamento agendado",
  encerrada: "Encerrada",
};

/** Erro de conta sem assinatura vigente (somente leitura). HTTP 402, código "subscription_inactive". */
export class SubscriptionInactiveError extends AppError {
  constructor(message: string, details?: unknown) {
    super("limit_reached", message, details); // 402
    Object.defineProperty(this, "code", { value: "subscription_inactive", enumerable: true });
  }
}

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const DAY = 86400_000;

// ---------------- Avaliação (pura) ----------------

export type AlertKind = "trial_ending" | "trial_expired" | "payment_failed" | "cancel_scheduled" | "read_only";
export interface BillingAlert { kind: AlertKind; tone: "info" | "warning" | "danger"; message: string }

export interface SubscriptionState {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  graceUntil: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface Evaluation {
  /** status efetivo (ex.: cancelada após o fim do período conta como encerrada) */
  status: SubscriptionStatus;
  readOnly: boolean;
  /** por que a conta está somente leitura (vazio quando não está) */
  reasons: string[];
  alerts: BillingAlert[];
}

export function evaluateSubscription(s: SubscriptionState, opts: { now?: Date; paymentEnabled: boolean; suspended?: boolean }): Evaluation {
  const now = opts.now ?? new Date();
  const reasons: string[] = [];
  const alerts: BillingAlert[] = [];
  let status = s.status;
  if (opts.suspended) reasons.push("A conta está suspensa pela administração da plataforma. Fale com o suporte para reativar.");
  switch (s.status) {
    case "teste": {
      if (s.trialEndsAt && s.trialEndsAt <= now) {
        if (opts.paymentEnabled) {
          reasons.push(`O período de teste terminou em ${fmtDate(s.trialEndsAt)}. Assine um plano para voltar a criar e editar.`);
        } else {
          alerts.push({ kind: "trial_expired", tone: "info", message: `O período de teste terminou em ${fmtDate(s.trialEndsAt)}. A conta continua liberada enquanto nossa equipe ativa o seu plano.` });
        }
      } else if (s.trialEndsAt) {
        const left = Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / DAY);
        if (left <= 3) alerts.push({ kind: "trial_ending", tone: "warning", message: `Seu período de teste termina em ${left} dia${left === 1 ? "" : "s"} (${fmtDate(s.trialEndsAt)}).${opts.paymentEnabled ? " Assine um plano para não perder a edição." : ""}` });
      }
      break;
    }
    case "inadimplente": {
      if (s.graceUntil && s.graceUntil <= now) {
        reasons.push(`O pagamento não foi confirmado e o prazo para regularizar terminou em ${fmtDate(s.graceUntil)}. Atualize a forma de pagamento para voltar a editar.`);
      } else {
        alerts.push({ kind: "payment_failed", tone: "danger", message: `Não conseguimos confirmar o pagamento.${s.graceUntil ? ` Regularize até ${fmtDate(s.graceUntil)} para evitar que a conta fique somente leitura.` : ""}` });
      }
      break;
    }
    case "cancelada": {
      if (s.currentPeriodEnd && s.currentPeriodEnd <= now) {
        status = "encerrada";
        reasons.push(`A assinatura foi encerrada em ${fmtDate(s.currentPeriodEnd)}. Os dados continuam disponíveis para consulta e exportação.`);
      } else {
        alerts.push({ kind: "cancel_scheduled", tone: "info", message: `O cancelamento está agendado${s.currentPeriodEnd ? ` para ${fmtDate(s.currentPeriodEnd)}` : ""}. Até lá tudo continua funcionando.` });
      }
      break;
    }
    case "encerrada":
      reasons.push("A assinatura está encerrada. Os dados continuam disponíveis para consulta e exportação; para voltar a criar e editar, assine um plano.");
      break;
    case "ativa": break;
  }
  const readOnly = reasons.length > 0;
  if (readOnly) alerts.unshift({ kind: "read_only", tone: "danger", message: `Conta somente leitura: ${reasons[0]}` });
  return { status, readOnly, reasons, alerts };
}

// ---------------- Leitura ----------------

/** Linha "virtual" para contas sem assinatura gravada (anteriores à Etapa 4): manual e ativa. */
function backfill(orgId: string, planId: string): SubRow {
  const epoch = new Date(0);
  return {
    id: "", orgId, planId, provider: "manual", providerCustomerId: null, providerSubscriptionId: null, status: "ativa",
    testMode: true, currentPeriodEnd: null, trialEndsAt: null, cancelAtPeriodEnd: false, graceUntil: null, createdAt: epoch, updatedAt: epoch,
  };
}

async function loadOrgAndSub(orgId: string, db: Executor) {
  const [row] = await db.select({ org: schema.organizations, plan: schema.plans, sub: schema.subscriptions })
    .from(schema.organizations)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.orgId, schema.organizations.id))
    .where(and(eq(schema.organizations.id, orgId), isNull(schema.organizations.deletedAt)));
  if (!row) throw new AppError("not_found", "Conta não encontrada.");
  return { org: row.org, plan: row.plan, sub: row.sub ?? backfill(orgId, row.org.planId), stored: !!row.sub };
}

const paymentEnabled = () => billingConfig().provider !== "manual";

/** Direitos de uso da conta: plano, limites, status efetivo e se está somente leitura (com motivos). */
export async function entitlements(orgId: string, db: Executor = getDb(), now = new Date()) {
  const { org, plan, sub, stored } = await loadOrgAndSub(orgId, db);
  const ev = evaluateSubscription(sub, { now, paymentEnabled: paymentEnabled(), suspended: !!org.suspendedAt });
  return {
    plan: { id: plan.id, name: plan.name, priceCents: plan.priceCents },
    limits: plan.limits,
    status: ev.status,
    storedStatus: sub.status,
    readOnly: ev.readOnly,
    reasons: ev.reasons,
    alerts: ev.alerts,
    subscription: { ...sub, stored },
  };
}

/** Lança SubscriptionInactiveError (402, subscription_inactive) quando a conta está somente leitura. */
export async function assertWritable(orgId: string, db: Executor = getDb()) {
  const [row] = await db.select({ suspendedAt: schema.organizations.suspendedAt, sub: schema.subscriptions })
    .from(schema.organizations).leftJoin(schema.subscriptions, eq(schema.subscriptions.orgId, schema.organizations.id))
    .where(eq(schema.organizations.id, orgId));
  if (!row) return; // conta inexistente: a própria rota responde
  if (!row.sub && !row.suspendedAt) return; // sem assinatura gravada = manual/ativa
  const ev = evaluateSubscription(row.sub ?? backfill(orgId, ""), { paymentEnabled: paymentEnabled(), suspended: !!row.suspendedAt });
  if (ev.readOnly) {
    throw new SubscriptionInactiveError(`Conta somente leitura. ${ev.reasons[0]} Você ainda pode consultar, exportar os dados da conta e cuidar do plano em Conta › Plano e cobrança.`, { status: ev.status });
  }
}

// ---------------- Cadastro / seed / administração ----------------

/** Cria a assinatura de teste de uma conta nova (cadastro). */
export async function createTrialSubscription(orgId: string, planId: string, db: Executor = getDb(), now = new Date()) {
  const { trialDays } = billingConfig();
  await db.insert(schema.subscriptions).values({
    id: subId(), orgId, planId, provider: "manual", status: trialDays > 0 ? "teste" : "ativa",
    trialEndsAt: trialDays > 0 ? new Date(now.getTime() + trialDays * DAY) : null, testMode: true,
  }).onConflictDoNothing({ target: schema.subscriptions.orgId });
}

/** Garante assinatura manual e ativa (conta de demonstração no seed). */
export async function ensureManualActiveSubscription(orgId: string, db: Executor = getDb()) {
  const [org] = await db.select({ planId: schema.organizations.planId }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!org) return;
  await db.insert(schema.subscriptions).values({ id: subId(), orgId, planId: org.planId, provider: "manual", status: "ativa", testMode: true })
    .onConflictDoNothing({ target: schema.subscriptions.orgId });
}

export const manualUpdateSchema = z.object({
  planId: z.string().min(1).optional(),
  status: z.enum(schema.subscriptionStatusEnum.enumValues).optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
});

/**
 * Ajuste manual da assinatura (para a administração da plataforma, provedor "manual").
 * Quem chama verifica se o usuário é administrador da plataforma e grava admin_audit_log.
 */
export async function setManualSubscription(orgId: string, raw: unknown, actorUserId: string) {
  const input = manualUpdateSchema.parse(raw);
  const { graceDays } = billingConfig();
  return getDb().transaction(async (tx) => {
    const { sub, stored } = await loadOrgAndSub(orgId, tx);
    if (input.planId) {
      const [p] = await tx.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.id, input.planId));
      if (!p) throw new AppError("validation", "Plano inexistente.");
      await tx.update(schema.organizations).set({ planId: input.planId, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
    }
    const status = input.status ?? sub.status;
    const next = {
      planId: input.planId ?? sub.planId,
      status,
      trialEndsAt: input.trialEndsAt !== undefined ? input.trialEndsAt : sub.trialEndsAt,
      currentPeriodEnd: input.currentPeriodEnd !== undefined ? input.currentPeriodEnd : sub.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? (status === "cancelada" ? true : status === "ativa" ? false : sub.cancelAtPeriodEnd),
      graceUntil: status === "inadimplente" ? sub.graceUntil ?? new Date(Date.now() + graceDays * DAY) : null,
      updatedAt: new Date(),
    };
    if (stored) await tx.update(schema.subscriptions).set(next).where(eq(schema.subscriptions.orgId, orgId));
    else await tx.insert(schema.subscriptions).values({ id: subId(), orgId, provider: "manual", testMode: true, ...next });
    await tx.insert(schema.billingEvents).values({
      id: eventId(), orgId, provider: "manual", providerEventId: eventId(), type: "manual.update", testMode: true,
      summary: { by: actorUserId, planId: next.planId, status: next.status },
    });
    await writeAudit(tx, { orgId, userId: actorUserId, action: "billing.manual_update", entityType: "subscription", entityId: orgId, summary: `Assinatura ajustada pela equipe da plataforma: plano ${next.planId}, ${SUBSCRIPTION_STATUS_LABEL[next.status]}.` });
    return entitlements(orgId, tx);
  });
}

// ---------------- Visão da tela "Plano e cobrança" ----------------

const STATUS_EXPLANATION: Record<SubscriptionStatus, string> = {
  teste: "Você está usando o período de teste gratuito, com os recursos do plano atual.",
  ativa: "Assinatura em dia. Todos os recursos do plano estão liberados.",
  inadimplente: "O último pagamento não foi confirmado. Durante a carência tudo continua funcionando; depois a conta fica somente leitura até o pagamento ser regularizado.",
  cancelada: "O cancelamento foi pedido e acontece no fim do período já pago. Você pode desistir do cancelamento até lá.",
  encerrada: "A assinatura terminou. Seus dados continuam guardados para consulta e exportação.",
};

export async function billingOverview(ctx: TenantCtx) {
  const db = getDb();
  const ent = await entitlements(ctx.orgId, db);
  const provider = getBillingProvider();
  const cfg = billingConfig();
  const [counts, monthly, plans] = await Promise.all([orgUsage(ctx.orgId, db), monthlyUsage(ctx.orgId, db), listActivePlans(db)]);
  const L = ent.limits;
  const canManage = can(ctx.role, "billing.manage");
  const sub = ent.subscription;
  const history = canManage
    ? (await db.select({ type: schema.billingEvents.type, status: schema.billingEvents.status, createdAt: schema.billingEvents.createdAt, provider: schema.billingEvents.provider })
      .from(schema.billingEvents).where(eq(schema.billingEvents.orgId, ctx.orgId)).orderBy(desc(schema.billingEvents.createdAt)).limit(10))
    : [];
  return {
    provider: {
      name: provider.name, configured: provider.configured, testMode: provider.testMode,
      // motivo da recusa da configuração (sem segredos) apenas para quem administra a conta
      problem: canManage ? cfg.stripeProblem : null,
    },
    canManage,
    readOnly: ent.readOnly,
    reasons: ent.reasons,
    alerts: ent.alerts,
    subscription: {
      status: ent.status, statusLabel: SUBSCRIPTION_STATUS_LABEL[ent.status], explanation: STATUS_EXPLANATION[ent.status],
      provider: sub.provider, testMode: sub.testMode, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd,
      graceUntil: sub.graceUntil, cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      hasPaymentAccount: !!sub.providerCustomerId, hasProviderSubscription: !!sub.providerSubscriptionId,
    },
    plan: { id: ent.plan.id, name: ent.plan.name, priceCents: ent.plan.priceCents, limits: L },
    usage: {
      stores: { used: counts.stores, limit: L.stores },
      users: { used: counts.members + counts.pendingInvitations, limit: L.users },
      storage: { used: monthly.storageBytes, limit: L.storageMb * 1024 * 1024 },
      exports: { used: monthly.exportsThisMonth, limit: L.exportsPerMonth },
      aiCredits: { used: monthly.aiCreditsThisMonth, limit: L.aiCreditsPerMonth },
      videoMinutes: { used: Math.ceil(monthly.videoSecondsThisMonth / 60), limit: L.videoMinutesPerMonth },
    },
    plans: plans.map((p) => ({
      id: p.id, name: p.name, priceCents: p.priceCents, limits: p.limits,
      features: p.limits.features.map((f) => FEATURE_LABEL[f] ?? f),
      current: p.id === ent.plan.id,
      checkoutAvailable: provider.configured && p.priceCents != null && !!p.providerPriceId,
    })),
    history,
  };
}

// ---------------- Ações do cliente ----------------

function requireManage(ctx: TenantCtx) {
  if (!can(ctx.role, "billing.manage")) throw forbidden("Somente administradores da conta podem alterar o plano e a cobrança.");
}

async function logAction(db: Executor, orgId: string, provider: ProviderName, type: string, summary: Record<string, unknown>) {
  await db.insert(schema.billingEvents).values({ id: eventId(), orgId, provider: "app", providerEventId: eventId(), type, testMode: getBillingProvider().testMode, summary: { ...summary, provider } });
}

export async function startCheckout(ctx: TenantCtx, raw: unknown) {
  requireManage(ctx);
  const { planId } = z.object({ planId: z.string().min(1).max(60) }).parse(raw);
  const provider = getBillingProvider();
  if (!provider.configured) throw new AppError("validation", PAYMENT_NOT_ENABLED);
  const db = getDb();
  const [plan] = await db.select().from(schema.plans).where(and(eq(schema.plans.id, planId), eq(schema.plans.isActive, true)));
  if (!plan) throw new AppError("not_found", "Plano não encontrado.");
  if (plan.priceCents == null || !plan.providerPriceId)
    throw new AppError("validation", `O valor do plano ${plan.name} ainda não foi definido. Não é possível assinar este plano por enquanto.`);
  const { sub } = await loadOrgAndSub(ctx.orgId, db);
  if (sub.providerSubscriptionId && sub.status !== "encerrada")
    throw new AppError("conflict", "A conta já tem uma assinatura com pagamento online. Use \"Gerenciar pagamento\" para trocar de plano ou de cartão.");
  const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, ctx.userId));
  const r = await provider.createCheckout({
    orgId: ctx.orgId, planId: plan.id, priceId: plan.providerPriceId,
    customerId: sub.providerCustomerId, customerEmail: user?.email ?? null,
    successUrl: appUrl("/app/conta/plano?checkout=ok"), cancelUrl: appUrl("/app/conta/plano?checkout=cancelado"),
    trialEnd: sub.status === "teste" ? sub.trialEndsAt : null,
  });
  await logAction(db, ctx.orgId, provider.name, "checkout.iniciado", { planId: plan.id, by: ctx.userId });
  return { url: r.url };
}

export async function openPortal(ctx: TenantCtx) {
  requireManage(ctx);
  const provider = getBillingProvider();
  if (!provider.configured) throw new AppError("validation", PAYMENT_NOT_ENABLED);
  const { sub } = await loadOrgAndSub(ctx.orgId, getDb());
  if (!sub.providerCustomerId) throw new AppError("validation", "Ainda não há dados de pagamento desta conta. Assine um plano primeiro.");
  return provider.createPortalSession({ customerId: sub.providerCustomerId, returnUrl: appUrl("/app/conta/plano") });
}

async function changeCancellation(ctx: TenantCtx, cancel: boolean) {
  requireManage(ctx);
  const provider = getBillingProvider();
  if (!provider.configured) throw new AppError("validation", PAYMENT_NOT_ENABLED);
  const db = getDb();
  const { sub } = await loadOrgAndSub(ctx.orgId, db);
  if (!sub.providerSubscriptionId || sub.provider !== provider.name) throw new AppError("validation", "Não há assinatura com pagamento online para alterar.");
  if (cancel && !["ativa", "teste", "inadimplente"].includes(sub.status)) throw new AppError("validation", "A assinatura não está ativa para ser cancelada.");
  if (!cancel && sub.status !== "cancelada" && !sub.cancelAtPeriodEnd) throw new AppError("validation", "Não há cancelamento agendado para desfazer.");
  const snapshot = cancel ? await provider.cancel(sub.providerSubscriptionId) : await provider.resume(sub.providerSubscriptionId);
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, ctx.orgId)).for("update");
    if (locked) await applySnapshot(tx, locked, snapshot, new Date(), ctx.userId);
    await logAction(tx, ctx.orgId, provider.name, cancel ? "cancelamento.agendado" : "cancelamento.desfeito", { by: ctx.userId });
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: cancel ? "billing.cancel" : "billing.resume", entityType: "subscription", entityId: ctx.orgId,
      summary: cancel ? "Cancelamento da assinatura agendado para o fim do período." : "Cancelamento da assinatura desfeito." });
  });
  return billingOverview(ctx);
}
export const cancelSubscription = (ctx: TenantCtx) => changeCancellation(ctx, true);
export const resumeSubscription = (ctx: TenantCtx) => changeCancellation(ctx, false);

// ---------------- Webhooks ----------------

/** Status do Stripe → status interno. null = não muda (ex.: checkout ainda incompleto). */
export function mapProviderStatus(raw: string, cancelAtPeriodEnd: boolean): SubscriptionStatus | null {
  switch (raw) {
    case "trialing": return cancelAtPeriodEnd ? "cancelada" : "teste";
    case "active": return cancelAtPeriodEnd ? "cancelada" : "ativa";
    case "past_due": case "unpaid": return "inadimplente";
    case "canceled": case "incomplete_expired": case "paused": return "encerrada";
    default: return null;
  }
}

async function planIdForPrice(tx: Executor, priceId: string | null): Promise<string | null> {
  if (!priceId) return null;
  const [p] = await tx.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.providerPriceId, priceId));
  return p?.id ?? null;
}

type SubPatch = Partial<Omit<SubRow, "id" | "orgId" | "createdAt">>;

async function writeSub(tx: Tx, sub: SubRow, patch: SubPatch, actor: string | null) {
  await tx.update(schema.subscriptions).set({ ...patch, updatedAt: new Date() }).where(eq(schema.subscriptions.id, sub.id));
  if (patch.planId && patch.planId !== sub.planId) {
    await tx.update(schema.organizations).set({ planId: patch.planId, updatedAt: new Date() }).where(eq(schema.organizations.id, sub.orgId));
    await writeAudit(tx, { orgId: sub.orgId, userId: actor, action: "billing.plan_change", entityType: "subscription", entityId: sub.orgId, summary: `Plano alterado de ${sub.planId} para ${patch.planId}.` });
  }
  if (patch.status && patch.status !== sub.status) {
    await writeAudit(tx, { orgId: sub.orgId, userId: actor, action: "billing.status", entityType: "subscription", entityId: sub.orgId,
      summary: `Assinatura: ${SUBSCRIPTION_STATUS_LABEL[sub.status]} → ${SUBSCRIPTION_STATUS_LABEL[patch.status]}.` });
  }
}

function graceFor(sub: SubRow, from: Date): Date {
  return sub.status === "inadimplente" && sub.graceUntil ? sub.graceUntil : new Date(from.getTime() + billingConfig().graceDays * DAY);
}

async function applySnapshot(tx: Tx, sub: SubRow, s: ProviderSubscription, at: Date, actor: string | null): Promise<string | null> {
  const status = mapProviderStatus(s.rawStatus, s.cancelAtPeriodEnd);
  const planId = await planIdForPrice(tx, s.priceId);
  const patch: SubPatch = {
    providerSubscriptionId: s.id || sub.providerSubscriptionId,
    providerCustomerId: s.customerId ?? sub.providerCustomerId,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    currentPeriodEnd: s.currentPeriodEnd ?? sub.currentPeriodEnd,
    trialEndsAt: s.trialEnd ?? sub.trialEndsAt,
  };
  if (status) {
    patch.status = status;
    patch.graceUntil = status === "inadimplente" ? graceFor(sub, at) : null;
  }
  if (planId) patch.planId = planId;
  await writeSub(tx, sub, patch, actor);
  const notes = [!status ? `status ${s.rawStatus} sem efeito` : null, s.priceId && !planId ? "preço sem plano correspondente" : null].filter(Boolean);
  return notes.length ? notes.join("; ") : null;
}

interface Outcome { orgId: string | null; status: "processado" | "ignorado"; note: string | null; appliedState: boolean }

async function resolveOrg(tx: Tx, evt: WebhookEvent): Promise<string | null> {
  const S = schema.subscriptions;
  if (evt.subscriptionId) {
    const [r] = await tx.select({ orgId: S.orgId }).from(S).where(and(eq(S.provider, evt.provider), eq(S.providerSubscriptionId, evt.subscriptionId)));
    if (r) return r.orgId;
  }
  if (evt.customerId) {
    const [r] = await tx.select({ orgId: S.orgId }).from(S).where(and(eq(S.provider, evt.provider), eq(S.providerCustomerId, evt.customerId)));
    if (r) return r.orgId;
  }
  // primeira notícia de uma assinatura nova: só pelo id da conta gravado por nós nos metadados do checkout
  if (evt.orgIdHint && ["checkout_completed", "subscription_snapshot"].includes(evt.kind)) {
    const [o] = await tx.select({ id: schema.organizations.id }).from(schema.organizations)
      .where(and(eq(schema.organizations.id, evt.orgIdHint), isNull(schema.organizations.deletedAt)));
    if (o) {
      const [existing] = await tx.select({ customer: S.providerCustomerId }).from(S).where(eq(S.orgId, o.id));
      // a conta já tem outro cliente no provedor: não mistura
      if (existing?.customer && evt.customerId && existing.customer !== evt.customerId) return null;
      return o.id;
    }
  }
  return null;
}

/** Maior "created" (segundos) entre os eventos que já mudaram o estado desta conta. */
async function lastAppliedAt(tx: Tx, orgId: string, provider: string): Promise<number | null> {
  const [r] = await tx.select({ m: sql<string | null>`max((${schema.billingEvents.summary}->>'eventCreated')::bigint)` }).from(schema.billingEvents)
    .where(and(eq(schema.billingEvents.orgId, orgId), eq(schema.billingEvents.provider, provider), eq(schema.billingEvents.status, "processado"),
      sql`${schema.billingEvents.summary}->>'appliedState' = 'true'`));
  return r?.m != null ? Number(r.m) : null;
}

async function applyEvent(tx: Tx, evt: WebhookEvent): Promise<Outcome> {
  const ignore = (orgId: string | null, note: string): Outcome => ({ orgId, status: "ignorado", note, appliedState: false });
  if (evt.kind === "other") return ignore(null, "tipo de evento não tratado");
  const orgId = await resolveOrg(tx, evt);
  if (!orgId) return ignore(null, "conta não identificada");

  let [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, orgId)).for("update");
  if (!sub) {
    if (!["checkout_completed", "subscription_snapshot"].includes(evt.kind)) return ignore(orgId, "conta sem assinatura vinculada ao provedor");
    const [org] = await tx.select({ planId: schema.organizations.planId }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
    [sub] = await tx.insert(schema.subscriptions).values({ id: subId(), orgId, planId: org!.planId, provider: "manual", status: "ativa", testMode: evt.testMode }).returning();
  }
  const s = sub!;
  const createdSec = Math.floor(evt.createdAt.getTime() / 1000);
  const last = await lastAppliedAt(tx, orgId, evt.provider);
  const stale = last !== null && createdSec < last;
  // evento de outra assinatura do mesmo cliente: só vale se a vigente já terminou (assinatura nova)
  const linksDiffer = !!(s.providerSubscriptionId && evt.subscriptionId && s.providerSubscriptionId !== evt.subscriptionId)
    && !(evt.kind === "subscription_snapshot" && s.status === "encerrada");

  if (evt.kind === "checkout_completed") {
    const link: SubPatch = {
      provider: evt.provider, testMode: evt.testMode,
      providerCustomerId: evt.customerId ?? s.providerCustomerId,
      providerSubscriptionId: evt.subscriptionId ?? s.providerSubscriptionId,
    };
    if (stale) { await writeSub(tx, s, link, null); return { orgId, status: "processado", note: "evento antigo: só vinculado", appliedState: false }; }
    const planOk = evt.planIdHint ? (await tx.select({ id: schema.plans.id }).from(schema.plans).where(eq(schema.plans.id, evt.planIdHint)))[0] : undefined;
    await writeSub(tx, s, { ...link, status: evt.noPaymentRequired ? "teste" : "ativa", graceUntil: null, cancelAtPeriodEnd: false, ...(planOk ? { planId: planOk.id } : {}) }, null);
    return { orgId, status: "processado", note: null, appliedState: true };
  }

  if (linksDiffer) return ignore(orgId, "assinatura diferente da vigente");
  if (stale) return ignore(orgId, "evento anterior ao estado atual");

  switch (evt.kind) {
    case "subscription_snapshot": {
      const note = await applySnapshot(tx, { ...s, provider: evt.provider }, evt.subscription!, evt.createdAt, null);
      if (s.provider !== evt.provider) await tx.update(schema.subscriptions).set({ provider: evt.provider, testMode: evt.testMode }).where(eq(schema.subscriptions.id, s.id));
      return { orgId, status: "processado", note, appliedState: true };
    }
    case "subscription_deleted":
      await writeSub(tx, s, { status: "encerrada", cancelAtPeriodEnd: false, graceUntil: null, currentPeriodEnd: evt.subscription?.currentPeriodEnd ?? s.currentPeriodEnd }, null);
      return { orgId, status: "processado", note: null, appliedState: true };
    case "invoice_paid": {
      // fatura de valor zero no início de um teste não encerra o teste
      if (s.status === "teste" && (evt.invoice?.amountCents ?? 0) === 0) {
        await writeSub(tx, s, { currentPeriodEnd: evt.invoice?.periodEnd ?? s.currentPeriodEnd }, null);
        return { orgId, status: "processado", note: "fatura de valor zero (teste)", appliedState: false };
      }
      await writeSub(tx, s, { status: s.cancelAtPeriodEnd ? "cancelada" : "ativa", graceUntil: null, currentPeriodEnd: evt.invoice?.periodEnd ?? s.currentPeriodEnd }, null);
      return { orgId, status: "processado", note: null, appliedState: true };
    }
    case "invoice_payment_failed":
      if (s.status === "encerrada") return ignore(orgId, "assinatura já encerrada");
      await writeSub(tx, s, { status: "inadimplente", graceUntil: graceFor(s, evt.createdAt) }, null);
      return { orgId, status: "processado", note: null, appliedState: true };
    case "charge_refunded":
      if (!evt.refund?.full) return { orgId, status: "processado", note: "reembolso parcial registrado (acesso mantido)", appliedState: false };
      await writeSub(tx, s, { status: "encerrada", graceUntil: null, cancelAtPeriodEnd: false }, null);
      return { orgId, status: "processado", note: "reembolso total: acesso encerrado", appliedState: true };
  }
  return ignore(orgId, "tipo de evento não tratado");
}

/** Processa um evento já validado. Idempotente por (provider, provider_event_id). */
export async function processWebhookEvent(evt: WebhookEvent, provider: Pick<BillingProvider, "testMode"> = getBillingProvider()) {
  return getDb().transaction(async (tx) => {
    const id = eventId();
    const inserted = await tx.insert(schema.billingEvents).values({
      id, orgId: null, provider: evt.provider, providerEventId: evt.id, type: evt.type, testMode: evt.testMode, summary: evt.summary, status: "processado",
    }).onConflictDoNothing({ target: [schema.billingEvents.provider, schema.billingEvents.providerEventId] }).returning({ id: schema.billingEvents.id });
    if (!inserted.length) return { received: true, duplicate: true, status: "duplicado" as const };
    const outcome: Outcome = evt.testMode !== provider.testMode
      ? { orgId: null, status: "ignorado", note: evt.testMode ? "evento de testes com chave de produção" : "evento de produção recusado no modo de testes", appliedState: false }
      : await applyEvent(tx, evt);
    await tx.update(schema.billingEvents).set({
      orgId: outcome.orgId, status: outcome.status, error: outcome.note,
      summary: { ...evt.summary, eventCreated: Math.floor(evt.createdAt.getTime() / 1000), appliedState: outcome.appliedState },
    }).where(eq(schema.billingEvents.id, id));
    return { received: true, duplicate: false, status: outcome.status };
  });
}

/** Valida e processa o corpo bruto de um webhook. Lança WebhookSignatureError quando a assinatura não confere. */
export async function handleWebhook(providerName: ProviderName, rawBody: string, headers: Headers) {
  const provider = webhookProvider(providerName);
  if (!provider) throw new AppError("not_found", "Recebimento de eventos de pagamento não configurado.");
  const evt = provider.parseWebhook(rawBody, headers);
  return processWebhookEvent(evt, provider);
}
