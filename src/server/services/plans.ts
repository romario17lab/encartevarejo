import { and, asc, count, eq, gt, gte, isNull, sum } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError } from "../errors";

export type PlanLimits = typeof schema.plans.$inferSelect["limits"];

export async function getOrgPlan(orgId: string, db: Executor = getDb()) {
  const [row] = await db.select({ plan: schema.plans }).from(schema.organizations)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId))
    .where(eq(schema.organizations.id, orgId));
  if (!row) throw new AppError("not_found", "Plano da conta não encontrado.");
  return row.plan;
}

export async function orgUsage(orgId: string, db: Executor = getDb()) {
  const [stores] = await db.select({ n: count() }).from(schema.stores).where(and(eq(schema.stores.orgId, orgId), isNull(schema.stores.deletedAt)));
  const [members] = await db.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.orgId, orgId));
  const [invites] = await db.select({ n: count() }).from(schema.invitations).where(and(
    eq(schema.invitations.orgId, orgId), isNull(schema.invitations.acceptedAt), isNull(schema.invitations.revokedAt), gt(schema.invitations.expiresAt, new Date())));
  return { stores: stores!.n, members: members!.n, pendingInvitations: invites!.n };
}

/** Lança limit_reached se a conta já usa todas as lojas do plano. */
export async function assertStoreLimit(orgId: string, db: Executor = getDb()) {
  const plan = await getOrgPlan(orgId, db);
  const usage = await orgUsage(orgId, db);
  if (usage.stores >= plan.limits.stores) {
    throw new AppError("limit_reached",
      `O plano ${plan.name} permite até ${plan.limits.stores} loja${plan.limits.stores === 1 ? "" : "s"}. Para cadastrar outra filial, altere o plano da conta.`,
      { limit: plan.limits.stores, used: usage.stores });
  }
}

/** Lança limit_reached se membros + convites pendentes já atingem o limite de usuários. */
export async function assertUserLimit(orgId: string, db: Executor = getDb(), opts: { countingInvitation?: boolean } = {}) {
  const plan = await getOrgPlan(orgId, db);
  const usage = await orgUsage(orgId, db);
  // ao aceitar um convite, o próprio convite já está contado entre os pendentes
  const used = usage.members + usage.pendingInvitations - (opts.countingInvitation ? 1 : 0);
  if (used >= plan.limits.users) {
    throw new AppError("limit_reached",
      `O plano ${plan.name} permite até ${plan.limits.users} usuário${plan.limits.users === 1 ? "" : "s"} (incluindo convites pendentes). Remova alguém ou altere o plano.`,
      { limit: plan.limits.users, used });
  }
}

// ---------------- Recursos e consumo (Etapa 4) ----------------

/** Recursos avançados que um plano pode incluir (limits.features). */
export const FEATURE_LABEL: Record<string, string> = {
  vitrine: "Vitrine online",
  exportacao: "Exportação de arquivos",
  agendamento: "Agendamento de campanhas",
  filiais: "Várias filiais",
  aprovacao_multipla: "Aprovação em várias etapas",
  ia: "Recursos de inteligência artificial",
  video: "Vídeos",
  tv: "TV da loja",
  agencia: "Modo agência",
};

/** Início do mês corrente no horário de Brasília (UTC-3, sem horário de verão). */
export function monthStartBrt(now = new Date()): Date {
  const brt = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, 3, 0, 0));
}

export type UsageKind = "exports" | "storage" | "ai_credit" | "video_second";

/** Consumo do mês e armazenamento total da conta. */
export async function monthlyUsage(orgId: string, db: Executor = getDb(), now = new Date()) {
  const since = monthStartBrt(now);
  const [exp] = await db.select({ n: count() }).from(schema.exportJobs).where(and(eq(schema.exportJobs.orgId, orgId), gte(schema.exportJobs.createdAt, since)));
  const [bytes] = await db.select({ total: sum(schema.assets.bytes) }).from(schema.assets).where(eq(schema.assets.orgId, orgId));
  const rows = await db.select({ kind: schema.usageEvents.kind, total: sum(schema.usageEvents.quantity) }).from(schema.usageEvents)
    .where(and(eq(schema.usageEvents.orgId, orgId), gte(schema.usageEvents.createdAt, since))).groupBy(schema.usageEvents.kind);
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, Number(r.total ?? 0)]));
  return {
    exportsThisMonth: exp!.n,
    storageBytes: Number(bytes?.total ?? 0),
    aiCreditsThisMonth: byKind.ai_credit ?? 0,
    videoSecondsThisMonth: byKind.video_second ?? 0,
  };
}

/** Lança limit_reached se o plano não inclui o recurso. */
export async function assertFeature(orgId: string, feature: string, db: Executor = getDb()) {
  const plan = await getOrgPlan(orgId, db);
  if (!plan.limits.features.includes(feature)) {
    throw new AppError("limit_reached", `O recurso "${FEATURE_LABEL[feature] ?? feature}" não está incluído no plano ${plan.name}. Altere o plano para usar.`, { feature });
  }
}

/**
 * Lança limit_reached se consumir `qty` ultrapassa o limite do plano.
 * exports: pedidos de exportação no mês · storage: bytes armazenados · ai_credit: créditos de IA no mês ·
 * video_second: segundos de vídeo no mês (limite em minutos). Limite 0 = recurso não incluído (nunca ilimitado).
 */
export async function assertUsage(orgId: string, kind: UsageKind, qty = 1, db: Executor = getDb()) {
  const plan = await getOrgPlan(orgId, db);
  const u = await monthlyUsage(orgId, db);
  const L = plan.limits;
  const fail = (msg: string, limit: number, used: number) => { throw new AppError("limit_reached", msg, { kind, limit, used }); };
  switch (kind) {
    case "exports":
      if (u.exportsThisMonth + qty > L.exportsPerMonth) fail(`O plano ${plan.name} permite ${L.exportsPerMonth} exportações por mês. O limite deste mês foi atingido.`, L.exportsPerMonth, u.exportsThisMonth);
      break;
    case "storage": {
      const limit = L.storageMb * 1024 * 1024;
      if (u.storageBytes + qty > limit) fail(`O armazenamento do plano ${plan.name} (${L.storageMb} MB) está cheio. Exclua arquivos antigos ou altere o plano.`, limit, u.storageBytes);
      break;
    }
    case "ai_credit":
      if (u.aiCreditsThisMonth + qty > L.aiCreditsPerMonth)
        fail(L.aiCreditsPerMonth ? `Os créditos de IA do plano ${plan.name} (${L.aiCreditsPerMonth} por mês) acabaram neste mês.` : `O plano ${plan.name} não inclui recursos de IA.`, L.aiCreditsPerMonth, u.aiCreditsThisMonth);
      break;
    case "video_second": {
      const limit = L.videoMinutesPerMonth * 60;
      if (u.videoSecondsThisMonth + qty > limit)
        fail(limit ? `Os minutos de vídeo do plano ${plan.name} (${L.videoMinutesPerMonth} por mês) acabaram neste mês.` : `O plano ${plan.name} não inclui vídeos.`, limit, u.videoSecondsThisMonth);
      break;
    }
  }
}

/** Registra consumo de recurso pago (IA, vídeo). Exportações e armazenamento são contados nas próprias tabelas. */
export async function recordUsage(orgId: string, kind: "ai_credit" | "video_second", quantity: number, ref: string | null = null, db: Executor = getDb()) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError("validation", "Quantidade de consumo inválida.");
  await db.insert(schema.usageEvents).values({ orgId, kind, quantity, ref });
}

/** Planos ativos, na ordem de exibição. */
export async function listActivePlans(db: Executor = getDb()) {
  return db.select().from(schema.plans).where(eq(schema.plans.isActive, true)).orderBy(asc(schema.plans.sortOrder), asc(schema.plans.id));
}

/**
 * Planos padrão (sem preços: valores comerciais são definidos pelo dono na administração).
 * Limites de serviços pagos (IA, vídeo) são sempre finitos — nunca ilimitados sem análise de custo.
 */
export const DEFAULT_PLANS: Array<{ id: string; name: string; sortOrder: number; limits: PlanLimits }> = [
  { id: "inicial", name: "Inicial", sortOrder: 1, limits: { stores: 1, users: 2, storageMb: 1024, exportsPerMonth: 200, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: ["vitrine", "exportacao"] } },
  { id: "profissional", name: "Profissional", sortOrder: 2, limits: { stores: 3, users: 8, storageMb: 5120, exportsPerMonth: 1000, videoMinutesPerMonth: 10, aiCreditsPerMonth: 100, features: ["vitrine", "exportacao", "agendamento", "filiais", "tv"] } },
  { id: "redes", name: "Redes e Agências", sortOrder: 3, limits: { stores: 30, users: 50, storageMb: 20480, exportsPerMonth: 5000, videoMinutesPerMonth: 60, aiCreditsPerMonth: 500, features: ["vitrine", "exportacao", "agendamento", "filiais", "aprovacao_multipla", "tv", "agencia"] } },
];

/**
 * Garante que os planos existam (idempotente). Usado no seed e nos testes.
 * Não sobrescreve nome, limites, preço nem id de preço de um plano já existente: depois de criados,
 * quem ajusta é a administração da plataforma.
 */
export async function ensurePlans(db: Executor = getDb()) {
  for (const p of DEFAULT_PLANS) {
    await db.insert(schema.plans).values({ id: p.id, name: p.name, limits: p.limits, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: schema.plans.id });
  }
}
