import "../zod-pt";
import { z } from "zod";
import { and, asc, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { ROLES, ROLE_LABEL } from "@/domain/campaign";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { assertFeature, getOrgPlan } from "./plans";
import { insertBrandKit } from "./brand-kits";
import { insertStore, storeInputSchema } from "./stores";
import { createTrialSubscription } from "./subscriptions";

// Modo agência.
// - A agência é uma conta (organizations.kind = "agencia") com o recurso "agencia" no plano.
// - Cada cliente é uma conta própria (organizations.agency_org_id = agência), com identidade visual, lojas,
//   produtos e campanhas próprios. Quem da agência atende o cliente recebe um VÍNCULO (membership) na conta
//   do cliente: todo o isolamento por conta já existente continua valendo, conta por conta.
// - O painel da agência só mostra contagens das contas de cliente em que o usuário tem vínculo.
//   Nenhum dado privado (produtos, preços, custos, campanhas) é agregado entre clientes.
// - Desligar: o administrador da agência ou do cliente remove a ligação; os vínculos das pessoas da agência
//   na conta do cliente são removidos (perdem o acesso). Registrado nas duas contas.

const MAX_CLIENTS = 300;

type OrgRow = typeof schema.organizations.$inferSelect;

async function loadOrg(orgId: string, db: Executor = getDb()): Promise<OrgRow> {
  const [org] = await db.select().from(schema.organizations).where(and(eq(schema.organizations.id, orgId), isNull(schema.organizations.deletedAt)));
  if (!org) throw notFound("Conta");
  return org;
}

/** Situação da conta ativa quanto ao modo agência (para a interface). */
export async function agencyStatus(ctx: TenantCtx) {
  const org = await loadOrg(ctx.orgId);
  const plan = await getOrgPlan(ctx.orgId);
  let agency: { id: string; name: string } | null = null;
  if (org.agencyOrgId) {
    const [a] = await getDb().select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations)
      .where(and(eq(schema.organizations.id, org.agencyOrgId), isNull(schema.organizations.deletedAt)));
    agency = a ?? null;
  }
  return {
    orgId: org.id,
    orgName: org.name,
    isAgency: org.kind === "agencia",
    featureAvailable: plan.limits.features.includes("agencia"),
    planName: plan.name,
    /** a conta ativa é cliente de uma agência */
    managedBy: agency,
    canManage: ctx.role === "admin",
  };
}

/** Exige que a conta ativa seja uma agência com o recurso no plano. */
async function assertAgency(ctx: TenantCtx, db: Executor = getDb()): Promise<OrgRow> {
  const org = await loadOrg(ctx.orgId, db);
  if (org.kind !== "agencia") throw new AppError("forbidden", "Esta conta não está no modo agência.");
  await assertFeature(ctx.orgId, "agencia", db);
  return org;
}

/** Ativa o modo agência na conta (somente administrador; plano com o recurso "agencia"). */
export async function enableAgencyMode(ctx: TenantCtx) {
  requirePermission(ctx, "org.manage");
  const db = getDb();
  const org = await loadOrg(ctx.orgId, db);
  if (org.kind === "agencia") return agencyStatus(ctx);
  if (org.agencyOrgId) throw new AppError("validation", "Esta conta é cliente de uma agência e não pode virar agência. Desligue-a da agência antes.");
  await assertFeature(ctx.orgId, "agencia", db);
  await db.update(schema.organizations).set({ kind: "agencia", updatedAt: new Date() }).where(eq(schema.organizations.id, ctx.orgId));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.agency_enable", entityType: "organization", entityId: ctx.orgId, summary: "Modo agência ativado na conta." });
  return agencyStatus(ctx);
}

// ---------------- Contas de cliente ----------------

export const createClientSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente.").max(80),
  storeName: z.string().trim().min(2, "Informe o nome da primeira loja.").max(80),
  segment: z.string().trim().max(40).optional(),
  /** pessoas da agência que também atenderão o cliente (além de quem cria, que entra como administrador) */
  members: z.array(z.object({ userId: z.string().min(1), role: z.enum(ROLES) })).max(50).optional().default([]),
});

export async function createClientAccount(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "org.manage");
  const input = createClientSchema.parse(raw);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // trava a agência: criação simultânea não passa do limite e a conta não deixa de ser agência no meio
    await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    const agency = await assertAgency(ctx, tx);
    const [{ n }] = await tx.select({ n: count() }).from(schema.organizations)
      .where(and(eq(schema.organizations.agencyOrgId, ctx.orgId), isNull(schema.organizations.deletedAt))) as [{ n: number }];
    if (n >= MAX_CLIENTS) throw new AppError("limit_reached", `A agência já tem ${n} contas de cliente (limite ${MAX_CLIENTS}).`);

    // só pessoas que já participam da agência podem ser vinculadas
    const extra = input.members.filter((m) => m.userId !== ctx.userId);
    const uniqueIds = [...new Set(extra.map((m) => m.userId))];
    if (uniqueIds.length !== extra.length) throw new AppError("validation", "A mesma pessoa foi escolhida mais de uma vez.");
    if (uniqueIds.length) {
      const rows = await tx.select({ userId: schema.memberships.userId }).from(schema.memberships)
        .where(and(eq(schema.memberships.orgId, ctx.orgId), inArray(schema.memberships.userId, uniqueIds)));
      if (rows.length !== uniqueIds.length) throw new AppError("validation", "Uma das pessoas escolhidas não participa da agência.");
    }

    const orgId = newId("org");
    // o cliente usa o mesmo plano da agência; assinatura própria (período de teste, como no cadastro)
    await tx.insert(schema.organizations).values({ id: orgId, name: input.name, planId: agency.planId, kind: "varejo", agencyOrgId: ctx.orgId });
    const bk = await insertBrandKit(orgId, input.name, tx);
    const store = await insertStore(orgId, storeInputSchema.parse({ name: input.storeName, segment: input.segment, brandKitId: bk.id }), tx);
    await tx.insert(schema.memberships).values([
      { orgId, userId: ctx.userId, role: "admin" as const },
      ...extra.map((m) => ({ orgId, userId: m.userId, role: m.role })),
    ]);
    await createTrialSubscription(orgId, agency.planId, tx);
    await writeAudit(tx, { orgId, userId: ctx.userId, action: "org.create", entityType: "organization", entityId: orgId,
      summary: `Conta "${input.name}" criada pela agência "${agency.name}".`, data: { agencyOrgId: ctx.orgId, members: 1 + extra.length } });
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "agency.client_create", entityType: "organization", entityId: orgId,
      summary: `Conta de cliente "${input.name}" criada (${1 + extra.length} pessoa(s) da agência com acesso).`,
      data: { members: [{ userId: ctx.userId, role: "admin" }, ...extra] } });
    return { id: orgId, name: input.name, storeId: store.id };
  });
  return result;
}

/**
 * Contas de cliente da agência em que o usuário tem vínculo, com contagens agregadas por conta.
 * Somente contagens: lojas, campanhas em revisão / agendadas / publicadas e aprovações externas pendentes.
 */
export async function listClients(ctx: TenantCtx, now = new Date()) {
  const db = getDb();
  await assertAgency(ctx, db);
  const rows = await db.select({ id: schema.organizations.id, name: schema.organizations.name, role: schema.memberships.role, createdAt: schema.organizations.createdAt, suspendedAt: schema.organizations.suspendedAt })
    .from(schema.organizations)
    .innerJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.organizations.id), eq(schema.memberships.userId, ctx.userId)))
    .where(and(eq(schema.organizations.agencyOrgId, ctx.orgId), isNull(schema.organizations.deletedAt)))
    .orderBy(asc(schema.organizations.name));
  const [{ total }] = await db.select({ total: count() }).from(schema.organizations)
    .where(and(eq(schema.organizations.agencyOrgId, ctx.orgId), isNull(schema.organizations.deletedAt))) as [{ total: number }];
  const clients = [];
  for (const r of rows) {
    const [stores] = await db.select({ n: count() }).from(schema.stores).where(and(eq(schema.stores.orgId, r.id), isNull(schema.stores.deletedAt)));
    const byStatus = await db.select({ status: schema.campaigns.status, n: count() }).from(schema.campaigns)
      .where(and(eq(schema.campaigns.orgId, r.id), isNull(schema.campaigns.deletedAt), inArray(schema.campaigns.status, ["em_revisao", "agendada", "publicada"])))
      .groupBy(schema.campaigns.status);
    const [pending] = await db.select({ n: count() }).from(schema.previewLinks)
      .where(and(eq(schema.previewLinks.orgId, r.id), isNull(schema.previewLinks.revokedAt), isNull(schema.previewLinks.decision), gt(schema.previewLinks.expiresAt, now)));
    const st = Object.fromEntries(byStatus.map((b) => [b.status, b.n])) as Record<string, number>;
    clients.push({
      id: r.id, name: r.name, role: r.role, roleLabel: ROLE_LABEL[r.role], suspended: !!r.suspendedAt,
      counts: { stores: stores!.n, inReview: st.em_revisao ?? 0, scheduled: st.agendada ?? 0, published: st.publicada ?? 0, pendingApprovals: pending!.n },
    });
  }
  return { clients, hiddenCount: total - rows.length };
}

/** Pessoas da agência (para escolher quem atende o novo cliente). */
export async function listAgencyMembers(ctx: TenantCtx) {
  requirePermission(ctx, "org.manage");
  await assertAgency(ctx);
  return getDb().select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
    .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, ctx.orgId)).orderBy(asc(schema.users.name));
}

// ---------------- Desligamento ----------------

/**
 * Desliga a conta do cliente da agência. Pode ser feito:
 * - pelo administrador da agência (conta ativa = agência; clientOrgId = conta do cliente), ou
 * - pelo administrador do cliente (conta ativa = cliente; clientOrgId omitido ou igual).
 * As pessoas da agência perdem o vínculo com o cliente. Exige que reste no cliente um administrador
 * com acesso a todas as lojas que não seja da agência (senão a conta ficaria sem dono).
 */
export async function detachClient(ctx: TenantCtx, clientOrgId?: string | null) {
  requirePermission(ctx, "org.manage");
  const db = getDb();
  const fromAgencySide = !!clientOrgId && clientOrgId !== ctx.orgId;
  const clientId = fromAgencySide ? clientOrgId! : ctx.orgId;
  return db.transaction(async (tx) => {
    const [client] = await tx.select().from(schema.organizations)
      .where(and(eq(schema.organizations.id, clientId), isNull(schema.organizations.deletedAt))).for("update");
    if (fromAgencySide) {
      // a agência só enxerga os próprios clientes; qualquer outro id é "não encontrado"
      if (!client || client.agencyOrgId !== ctx.orgId) throw notFound("Conta de cliente");
    } else if (!client || !client.agencyOrgId) {
      throw new AppError("validation", "Esta conta não está ligada a uma agência.");
    }
    const agencyId = client.agencyOrgId!;
    const [agency] = await tx.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, agencyId));
    const agencyUserIds = (await tx.select({ userId: schema.memberships.userId }).from(schema.memberships).where(eq(schema.memberships.orgId, agencyId))).map((r) => r.userId);
    const clientMembers = await tx.select().from(schema.memberships).where(eq(schema.memberships.orgId, clientId)).for("update");
    const removed = clientMembers.filter((m) => agencyUserIds.includes(m.userId));
    const remaining = clientMembers.filter((m) => !agencyUserIds.includes(m.userId));
    if (!remaining.some((m) => m.role === "admin" && m.storeIds === null)) {
      throw new AppError("validation", "Antes de desligar, convide para a conta do cliente um administrador da própria loja (com acesso a todas as lojas). Sem isso a conta ficaria sem responsável.");
    }
    const now = new Date();
    await tx.update(schema.organizations).set({ agencyOrgId: null, updatedAt: now }).where(eq(schema.organizations.id, clientId));
    if (removed.length) {
      const ids = removed.map((m) => m.userId);
      await tx.delete(schema.memberships).where(and(eq(schema.memberships.orgId, clientId), inArray(schema.memberships.userId, ids)));
      await tx.update(schema.sessions).set({ activeOrgId: null }).where(and(eq(schema.sessions.activeOrgId, clientId), inArray(schema.sessions.userId, ids)));
      // links de prévia ativos criados por quem perdeu o acesso deixam de valer (ninguém mais poderia revogá-los por eles)
      await tx.update(schema.previewLinks).set({ revokedAt: now })
        .where(and(eq(schema.previewLinks.orgId, clientId), inArray(schema.previewLinks.createdBy, ids), isNull(schema.previewLinks.revokedAt), isNull(schema.previewLinks.decision)));
    }
    const by = fromAgencySide ? "pela agência" : "pelo cliente";
    await writeAudit(tx, { orgId: clientId, userId: ctx.userId, action: "org.agency_detach", entityType: "organization", entityId: clientId,
      summary: `Conta desligada da agência "${agency?.name ?? "?"}" ${by}. ${removed.length} pessoa(s) da agência perderam o acesso.`, data: { agencyOrgId: agencyId, removedUserIds: removed.map((m) => m.userId) } });
    await writeAudit(tx, { orgId: agencyId, userId: ctx.userId, action: "agency.client_detach", entityType: "organization", entityId: clientId,
      summary: `Cliente "${client.name}" desligado da agência ${by}. ${removed.length} pessoa(s) da agência perderam o acesso.`, data: { removedUserIds: removed.map((m) => m.userId) } });
    return { ok: true, clientOrgId: clientId, removedMembers: removed.length };
  });
}
