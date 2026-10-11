import { and, count, eq, isNull, gt } from "drizzle-orm";
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

/** Planos padrão (sem preços: valores comerciais são definidos fora do código). */
export const DEFAULT_PLANS: Array<{ id: string; name: string; limits: PlanLimits }> = [
  { id: "inicial", name: "Inicial", limits: { stores: 1, users: 2, storageMb: 1024, exportsPerMonth: 200, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: ["vitrine", "exportacao"] } },
  { id: "profissional", name: "Profissional", limits: { stores: 3, users: 8, storageMb: 5120, exportsPerMonth: 1000, videoMinutesPerMonth: 10, aiCreditsPerMonth: 100, features: ["vitrine", "exportacao", "agendamento", "filiais"] } },
  { id: "redes", name: "Redes", limits: { stores: 30, users: 50, storageMb: 20480, exportsPerMonth: 5000, videoMinutesPerMonth: 60, aiCreditsPerMonth: 500, features: ["vitrine", "exportacao", "agendamento", "filiais", "aprovacao_multipla"] } },
];

/** Garante que os planos existam (idempotente). Usado no seed e nos testes. */
export async function ensurePlans(db: Executor = getDb()) {
  for (const p of DEFAULT_PLANS) {
    await db.insert(schema.plans).values({ id: p.id, name: p.name, limits: p.limits })
      .onConflictDoUpdate({ target: schema.plans.id, set: { name: p.name, limits: p.limits } });
  }
}
