// Contas (organizações) vistas pela administração da plataforma: busca, detalhe e ações com registro.
// Nunca expõe hashes de senha, tokens ou dados de sessão.
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, sum, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db";
import type { Executor } from "../../db/tx";
import { AppError, notFound } from "../../errors";
import { setManualSubscription } from "../subscriptions";
import { writeAdminAudit } from "./audit";

export const SUBSCRIPTION_STATUSES = ["teste", "ativa", "inadimplente", "cancelada", "encerrada"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  teste: "Em teste", ativa: "Ativa", inadimplente: "Inadimplente", cancelada: "Cancelada", encerrada: "Encerrada",
};

export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  planId: z.string().max(40).optional(),
  status: z.enum([...SUBSCRIPTION_STATUSES, "sem_assinatura"]).optional(),
  suspended: z.enum(["1", "0"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Agregados por conta (lojas, usuários, armazenamento) para uma lista de ids. */
async function orgAggregates(db: Executor, ids: string[]) {
  if (!ids.length) return { stores: new Map<string, number>(), users: new Map<string, number>(), storage: new Map<string, number>() };
  const [stores, users, storage] = await Promise.all([
    db.select({ orgId: schema.stores.orgId, n: count() }).from(schema.stores)
      .where(and(inArray(schema.stores.orgId, ids), isNull(schema.stores.deletedAt))).groupBy(schema.stores.orgId),
    db.select({ orgId: schema.memberships.orgId, n: count() }).from(schema.memberships)
      .where(inArray(schema.memberships.orgId, ids)).groupBy(schema.memberships.orgId),
    db.select({ orgId: schema.assets.orgId, bytes: sum(schema.assets.bytes) }).from(schema.assets)
      .where(inArray(schema.assets.orgId, ids)).groupBy(schema.assets.orgId),
  ]);
  return {
    stores: new Map(stores.map((r) => [r.orgId, r.n])),
    users: new Map(users.map((r) => [r.orgId, r.n])),
    storage: new Map(storage.map((r) => [r.orgId, Number(r.bytes ?? 0)])),
  };
}

export async function listAccounts(raw: Record<string, unknown>) {
  const q = listSchema.parse(raw);
  const db = getDb();
  const o = schema.organizations;
  const conds: (SQL | undefined)[] = [isNull(o.deletedAt)];
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    // nome da conta, id, ou e-mail/nome de algum membro
    conds.push(or(ilike(o.name, like), eq(o.id, q.q), sql`exists (select 1 from ${schema.memberships} m join ${schema.users} u on u.id = m.user_id where m.org_id = ${o.id} and (u.email ilike ${like} or u.name ilike ${like}))`));
  }
  if (q.planId) conds.push(eq(o.planId, q.planId));
  if (q.suspended === "1") conds.push(isNotNull(o.suspendedAt));
  if (q.suspended === "0") conds.push(isNull(o.suspendedAt));
  if (q.status === "sem_assinatura") conds.push(isNull(schema.subscriptions.id));
  else if (q.status) conds.push(eq(schema.subscriptions.status, q.status));
  const where = and(...conds);
  const base = db.select({
    id: o.id, name: o.name, kind: o.kind, isDemo: o.isDemo, planId: o.planId, planName: schema.plans.name, planLimits: schema.plans.limits,
    suspendedAt: o.suspendedAt, createdAt: o.createdAt,
    subscriptionStatus: schema.subscriptions.status, subscriptionProvider: schema.subscriptions.provider, trialEndsAt: schema.subscriptions.trialEndsAt,
  }).from(o)
    .innerJoin(schema.plans, eq(schema.plans.id, o.planId))
    .leftJoin(schema.subscriptions, eq(schema.subscriptions.orgId, o.id));
  const [rows, [{ total }]] = await Promise.all([
    base.where(where).orderBy(desc(o.createdAt), asc(o.id)).limit(q.limit).offset((q.page - 1) * q.limit),
    db.select({ total: count() }).from(o).leftJoin(schema.subscriptions, eq(schema.subscriptions.orgId, o.id)).where(where),
  ]);
  const agg = await orgAggregates(db, rows.map((r) => r.id));
  return {
    accounts: rows.map(({ planLimits, ...r }) => ({
      ...r,
      stores: agg.stores.get(r.id) ?? 0, users: agg.users.get(r.id) ?? 0,
      storageBytes: agg.storage.get(r.id) ?? 0, storageLimitMb: planLimits.storageMb,
      storesLimit: planLimits.stores, usersLimit: planLimits.users,
    })),
    total, page: q.page, limit: q.limit,
  };
}

async function getOrgRow(db: Executor, orgId: string) {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!org) throw notFound("Conta");
  return org;
}

export async function getAccountDetail(orgId: string) {
  const db = getDb();
  const org = await getOrgRow(db, orgId);
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, org.planId));
  const [sub] = await db.select({
    id: schema.subscriptions.id, planId: schema.subscriptions.planId, provider: schema.subscriptions.provider, status: schema.subscriptions.status,
    testMode: schema.subscriptions.testMode, currentPeriodEnd: schema.subscriptions.currentPeriodEnd, trialEndsAt: schema.subscriptions.trialEndsAt,
    cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd, graceUntil: schema.subscriptions.graceUntil,
    linkedToProvider: sql<boolean>`${schema.subscriptions.providerSubscriptionId} is not null`,
    createdAt: schema.subscriptions.createdAt, updatedAt: schema.subscriptions.updatedAt,
  }).from(schema.subscriptions).where(eq(schema.subscriptions.orgId, orgId));
  const members = await db.select({
    userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role,
    storeIds: schema.memberships.storeIds, since: schema.memberships.createdAt, isPlatformAdmin: schema.users.isPlatformAdmin,
  }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, orgId)).orderBy(asc(schema.memberships.createdAt));
  const stores = await db.select({
    id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug, segment: schema.stores.segment, address: schema.stores.address,
    storefrontEnabled: schema.stores.storefrontEnabled, deletedAt: schema.stores.deletedAt, createdAt: schema.stores.createdAt,
  }).from(schema.stores).where(eq(schema.stores.orgId, orgId)).orderBy(asc(schema.stores.createdAt));
  const usage = await orgUsageDetail(db, orgId);
  const [{ campaigns }] = await db.select({ campaigns: count() }).from(schema.campaigns).where(and(eq(schema.campaigns.orgId, orgId), isNull(schema.campaigns.deletedAt)));
  const recentAudit = await db.select({
    id: schema.auditLog.id, action: schema.auditLog.action, summary: schema.auditLog.summary, createdAt: schema.auditLog.createdAt,
    userName: schema.users.name,
  }).from(schema.auditLog).leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(eq(schema.auditLog.orgId, orgId)).orderBy(desc(schema.auditLog.id)).limit(20);
  const adminActions = await db.select({
    id: schema.adminAuditLog.id, action: schema.adminAuditLog.action, details: schema.adminAuditLog.details, createdAt: schema.adminAuditLog.createdAt,
    adminName: schema.users.name,
  }).from(schema.adminAuditLog).leftJoin(schema.users, eq(schema.users.id, schema.adminAuditLog.adminUserId))
    .where(and(eq(schema.adminAuditLog.targetType, "organization"), eq(schema.adminAuditLog.targetId, orgId)))
    .orderBy(desc(schema.adminAuditLog.id)).limit(20);
  const billing = await db.select({
    id: schema.billingEvents.id, provider: schema.billingEvents.provider, type: schema.billingEvents.type, status: schema.billingEvents.status,
    testMode: schema.billingEvents.testMode, createdAt: schema.billingEvents.createdAt,
  }).from(schema.billingEvents).where(eq(schema.billingEvents.orgId, orgId)).orderBy(desc(schema.billingEvents.createdAt)).limit(10);
  const { settings: _s, ...orgOut } = org;
  return {
    org: orgOut,
    plan: plan ? { id: plan.id, name: plan.name, limits: plan.limits, priceCents: plan.priceCents } : null,
    subscription: sub ?? null,
    members: members.map((m) => ({ ...m, storeIds: m.storeIds ?? null })),
    stores, usage, campaigns, recentAudit, adminActions, billing,
  };
}

/** Consumo do mês corrente de uma conta (armazenamento total, exportações, IA e vídeo). */
export async function orgUsageDetail(db: Executor, orgId: string, now = new Date()) {
  const from = monthStart(now);
  const [[st], [ex], usage] = await Promise.all([
    db.select({ bytes: sum(schema.assets.bytes) }).from(schema.assets).where(eq(schema.assets.orgId, orgId)),
    db.select({ n: count() }).from(schema.exportJobs).where(and(eq(schema.exportJobs.orgId, orgId), gte(schema.exportJobs.createdAt, from))),
    db.select({ kind: schema.usageEvents.kind, q: sum(schema.usageEvents.quantity) }).from(schema.usageEvents)
      .where(and(eq(schema.usageEvents.orgId, orgId), gte(schema.usageEvents.createdAt, from))).groupBy(schema.usageEvents.kind),
  ]);
  const u = new Map(usage.map((r) => [r.kind, Number(r.q ?? 0)]));
  return { storageBytes: Number(st?.bytes ?? 0), exportsThisMonth: ex?.n ?? 0, aiCreditsThisMonth: u.get("ai_credit") ?? 0, videoSecondsThisMonth: u.get("video_second") ?? 0, monthStart: from };
}

// ---------------- Ações ----------------
// Assinatura e evento de cobrança "manual" são gravados por setManualSubscription (módulo de cobrança);
// aqui ficam a validação, a regra de negócio da administração e o admin_audit_log.

const changePlanSchema = z.object({
  planId: z.string().min(1).max(40),
  status: z.enum(SUBSCRIPTION_STATUSES).default("ativa"),
  note: z.string().trim().max(500).optional(),
}).strict();

async function currentSubscription(db: Executor, orgId: string) {
  const [cur] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, orgId));
  return cur ?? null;
}

/**
 * Troca manual de plano: organizations.planId + assinatura (criada se não existir) + evento de cobrança "manual"
 * via setManualSubscription. Nenhum dado da conta é apagado, mesmo se o novo plano for menor.
 */
export async function changeAccountPlan(adminUserId: string, orgId: string, raw: unknown) {
  const input = changePlanSchema.parse(raw);
  const db = getDb();
  const org = await getOrgRow(db, orgId);
  if (org.deletedAt) throw new AppError("validation", "Esta conta foi excluída.");
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, input.planId));
  if (!plan) throw new AppError("validation", "Plano não encontrado.");
  const cur = await currentSubscription(db, orgId);
  await setManualSubscription(orgId, { planId: plan.id, status: input.status }, adminUserId);
  await writeAdminAudit(db, {
    adminUserId, action: "org.plan_change", targetType: "organization", targetId: orgId,
    details: { orgName: org.name, fromPlanId: org.planId, toPlanId: plan.id, fromStatus: cur?.status ?? null, toStatus: input.status, provider: cur?.provider ?? "manual", note: input.note ?? null },
  });
  return { orgId, planId: plan.id, status: input.status };
}

const trialSchema = z.object({ days: z.number().int().min(1, "Mínimo 1 dia.").max(90, "Máximo 90 dias por vez."), note: z.string().trim().max(500).optional() }).strict();

/** Estende (ou inicia) o período de teste. Conta com assinatura ativa não entra em teste. */
export async function extendTrial(adminUserId: string, orgId: string, raw: unknown) {
  const input = trialSchema.parse(raw);
  const db = getDb();
  const org = await getOrgRow(db, orgId);
  if (org.deletedAt) throw new AppError("validation", "Esta conta foi excluída.");
  const cur = await currentSubscription(db, orgId);
  if (cur?.status === "ativa") throw new AppError("validation", "A conta já tem assinatura ativa; não há período de teste para estender.");
  const now = new Date();
  const base = cur?.trialEndsAt && cur.trialEndsAt > now ? cur.trialEndsAt : now;
  const trialEndsAt = new Date(base.getTime() + input.days * 86_400_000);
  await setManualSubscription(orgId, { status: "teste", trialEndsAt }, adminUserId);
  await writeAdminAudit(db, {
    adminUserId, action: "org.trial_extend", targetType: "organization", targetId: orgId,
    details: { orgName: org.name, days: input.days, previousTrialEndsAt: cur?.trialEndsAt?.toISOString() ?? null, trialEndsAt: trialEndsAt.toISOString(), fromStatus: cur?.status ?? null, note: input.note ?? null },
  });
  return { orgId, trialEndsAt };
}

const suspendSchema = z.object({ reason: z.string().trim().min(5, "Descreva o motivo (mínimo 5 caracteres).").max(500) }).strict();
const reactivateSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();

export async function suspendAccount(adminUserId: string, orgId: string, raw: unknown) {
  const input = suspendSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    const org = await getOrgRow(tx, orgId);
    if (org.deletedAt) throw new AppError("validation", "Esta conta foi excluída.");
    if (org.suspendedAt) throw new AppError("conflict", "A conta já está suspensa.");
    const now = new Date();
    await tx.update(schema.organizations).set({ suspendedAt: now, updatedAt: now }).where(eq(schema.organizations.id, orgId));
    await writeAdminAudit(tx, { adminUserId, action: "org.suspend", targetType: "organization", targetId: orgId, details: { reason: input.reason, orgName: org.name } });
    return { orgId, suspendedAt: now };
  });
}

export async function reactivateAccount(adminUserId: string, orgId: string, raw: unknown) {
  const input = reactivateSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    const org = await getOrgRow(tx, orgId);
    if (!org.suspendedAt) throw new AppError("conflict", "A conta não está suspensa.");
    await tx.update(schema.organizations).set({ suspendedAt: null, updatedAt: new Date() }).where(eq(schema.organizations.id, orgId));
    await writeAdminAudit(tx, { adminUserId, action: "org.reactivate", targetType: "organization", targetId: orgId, details: { note: input.note ?? null, suspendedSince: org.suspendedAt.toISOString(), orgName: org.name } });
    return { orgId, suspendedAt: null };
  });
}
