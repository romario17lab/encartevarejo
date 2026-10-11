import { z } from "zod";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { getOrgPlan, orgUsage } from "./plans";

export async function getOrg(ctx: TenantCtx) {
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(and(eq(schema.organizations.id, ctx.orgId), isNull(schema.organizations.deletedAt)));
  if (!org) throw notFound("Conta");
  const plan = await getOrgPlan(ctx.orgId);
  const usage = await orgUsage(ctx.orgId);
  const { deletedAt: _d, ...rest } = org;
  return { ...rest, plan: { id: plan.id, name: plan.name, limits: plan.limits }, usage };
}

const orgPatch = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  settings: z.object({
    minMarginBp: z.number().int().min(-10000).max(10000).nullable().optional(),
    requireApproval: z.boolean().optional(),
  }).optional(),
});

export async function updateOrg(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "org.manage");
  const input = orgPatch.parse(raw);
  const db = getDb();
  const [cur] = await db.select().from(schema.organizations).where(and(eq(schema.organizations.id, ctx.orgId), isNull(schema.organizations.deletedAt)));
  if (!cur) throw notFound("Conta");
  const settings = input.settings ? { ...cur.settings, ...input.settings } : cur.settings;
  await db.update(schema.organizations).set({ name: input.name ?? cur.name, settings, updatedAt: new Date() }).where(eq(schema.organizations.id, ctx.orgId));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.update", entityType: "organization", entityId: ctx.orgId, summary: "Dados da conta atualizados.", data: { fields: Object.keys(input) } });
  return getOrg(ctx);
}

/**
 * Exportação completa dos dados da conta (JSON). Inclui custos (são dados do próprio dono),
 * nunca hashes de senha, tokens de convite ou de sessão.
 */
export async function exportOrg(ctx: TenantCtx) {
  requirePermission(ctx, "org.manage");
  const db = getDb();
  const o = ctx.orgId;
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, o));
  if (!org) throw notFound("Conta");
  const members = await db.select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role, storeIds: schema.memberships.storeIds, since: schema.memberships.createdAt })
    .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, o));
  const invitations = await db.select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt, acceptedAt: schema.invitations.acceptedAt, revokedAt: schema.invitations.revokedAt, createdAt: schema.invitations.createdAt })
    .from(schema.invitations).where(eq(schema.invitations.orgId, o));
  const campaigns = await db.select().from(schema.campaigns).where(eq(schema.campaigns.orgId, o));
  const data = {
    exportedAt: new Date().toISOString(),
    format: "encartevarejo-export-v1",
    organization: org,
    members, invitations,
    brandKits: await db.select().from(schema.brandKits).where(eq(schema.brandKits.orgId, o)),
    stores: await db.select().from(schema.stores).where(eq(schema.stores.orgId, o)),
    products: await db.select().from(schema.products).where(eq(schema.products.orgId, o)),
    storePrices: await db.select().from(schema.storePrices).where(eq(schema.storePrices.orgId, o)),
    campaigns,
    campaignItems: await db.select().from(schema.campaignItems).where(eq(schema.campaignItems.orgId, o)),
    campaignPieces: await db.select().from(schema.campaignPieces).where(eq(schema.campaignPieces.orgId, o)),
    campaignVersions: await db.select().from(schema.campaignVersions).where(eq(schema.campaignVersions.orgId, o)),
    assets: await db.select({ id: schema.assets.id, kind: schema.assets.kind, mime: schema.assets.mime, bytes: schema.assets.bytes, width: schema.assets.width, height: schema.assets.height, sha256: schema.assets.sha256, source: schema.assets.source, sourceNote: schema.assets.sourceNote, originalName: schema.assets.originalName, createdAt: schema.assets.createdAt })
      .from(schema.assets).where(eq(schema.assets.orgId, o)),
    exportJobs: await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.orgId, o)),
    calendarEvents: await db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.orgId, o)),
    auditLog: await db.select().from(schema.auditLog).where(eq(schema.auditLog.orgId, o)).orderBy(desc(schema.auditLog.id)),
  };
  await writeAudit(db, { orgId: o, userId: ctx.userId, action: "org.export", entityType: "organization", entityId: o, summary: "Exportação completa dos dados da conta gerada." });
  return data;
}

/** Exclusão (lógica) da conta. Exige digitar o nome exato da conta. */
export async function deleteOrg(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "org.manage");
  const { confirmName } = z.object({ confirmName: z.string() }).parse(raw);
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(and(eq(schema.organizations.id, ctx.orgId), isNull(schema.organizations.deletedAt)));
  if (!org) throw notFound("Conta");
  if (confirmName.trim() !== org.name.trim()) throw new AppError("validation", "Digite o nome da conta exatamente como aparece para confirmar a exclusão.");
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(schema.organizations).set({ deletedAt: now, updatedAt: now }).where(eq(schema.organizations.id, ctx.orgId));
    await tx.update(schema.stores).set({ storefrontEnabled: false, updatedAt: now }).where(eq(schema.stores.orgId, ctx.orgId));
    await tx.update(schema.sessions).set({ activeOrgId: null }).where(eq(schema.sessions.activeOrgId, ctx.orgId));
    await tx.update(schema.invitations).set({ revokedAt: now }).where(and(eq(schema.invitations.orgId, ctx.orgId), isNull(schema.invitations.acceptedAt), isNull(schema.invitations.revokedAt)));
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "org.delete", entityType: "organization", entityId: ctx.orgId, summary: `Conta "${org.name}" excluída.` });
  });
  return { ok: true };
}

export async function listAudit(ctx: TenantCtx, q: { entityType?: string | null; entityId?: string | null; cursor?: string | null; limit?: number }) {
  requirePermission(ctx, "audit.read");
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const conds = [eq(schema.auditLog.orgId, ctx.orgId)];
  if (q.entityType) conds.push(eq(schema.auditLog.entityType, q.entityType));
  if (q.entityId) conds.push(eq(schema.auditLog.entityId, q.entityId));
  if (q.cursor && /^\d+$/.test(q.cursor)) conds.push(lt(schema.auditLog.id, Number(q.cursor)));
  const rows = await getDb().select({ entry: schema.auditLog, userName: schema.users.name }).from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.userId))
    .where(and(...conds)).orderBy(desc(schema.auditLog.id)).limit(limit + 1);
  const page = rows.slice(0, limit).map((r) => ({ ...r.entry, userName: r.userName }));
  return { entries: page, nextCursor: rows.length > limit ? String(page[page.length - 1]!.id) : null };
}

/** Calendário comercial: movido para ./calendar-events (mantido aqui por compatibilidade de importação). */
export { listCalendar } from "./calendar-events";
