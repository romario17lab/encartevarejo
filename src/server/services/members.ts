import { z } from "zod";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { ROLES, ROLE_LABEL } from "@/domain/campaign";
import type { TenantCtx, UserCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { randomToken, sha256 } from "../signing";
import { writeAudit } from "../audit";
import { appUrl, sendEmail } from "../email";
import { requirePermission } from "../tenant";
import { assertUserLimit } from "./plans";
import { emailSchema, passwordSchema } from "./auth";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession } from "../auth/session";

const INVITE_DAYS = 7;

export async function listMembers(ctx: TenantCtx) {
  const rows = await getDb().select({
    userId: schema.users.id, name: schema.users.name, email: schema.users.email,
    role: schema.memberships.role, storeIds: schema.memberships.storeIds, createdAt: schema.memberships.createdAt,
  }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, ctx.orgId)).orderBy(asc(schema.memberships.createdAt));
  return rows.map((r) => ({ ...r, isYou: r.userId === ctx.userId }));
}

async function assertStoresInOrg(orgId: string, storeIds: string[] | null | undefined, db: Executor) {
  if (!storeIds || storeIds.length === 0) return;
  const rows = await db.select({ id: schema.stores.id }).from(schema.stores)
    .where(and(eq(schema.stores.orgId, orgId), inArray(schema.stores.id, storeIds), isNull(schema.stores.deletedAt)));
  if (rows.length !== new Set(storeIds).size) throw new AppError("validation", "Uma das lojas informadas não pertence a esta conta.");
}

async function adminCount(orgId: string, db: Executor) {
  const rows = await db.select({ userId: schema.memberships.userId }).from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "admin")));
  return rows.length;
}

/** Administradores com acesso a todas as lojas (store_ids nulo). A conta precisa manter ao menos um. */
async function fullAccessAdmins(orgId: string, db: Executor) {
  const rows = await db.select({ userId: schema.memberships.userId }).from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "admin"), isNull(schema.memberships.storeIds)));
  return rows.map((r) => r.userId);
}

async function memberName(userId: string, db: Executor) {
  const [u] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.name || u?.email || "membro";
}

async function storeNames(orgId: string, ids: string[], db: Executor) {
  if (!ids.length) return [];
  const rows = await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores).where(and(eq(schema.stores.orgId, orgId), inArray(schema.stores.id, ids)));
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const LAST_ADMIN = "A conta precisa ter pelo menos um administrador.";
const LAST_FULL_ADMIN = "A conta precisa ter pelo menos um administrador com acesso a todas as lojas.";

const memberPatch = z.object({
  role: z.enum(ROLES).optional(),
  storeIds: z.array(z.string()).max(100).nullable().optional(),
});

export async function updateMember(ctx: TenantCtx, userId: string, raw: unknown) {
  requirePermission(ctx, "members.manage");
  const input = memberPatch.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    // trava os vínculos da conta para que duas alterações simultâneas não deixem a conta sem administrador
    const all = await tx.select().from(schema.memberships).where(eq(schema.memberships.orgId, ctx.orgId)).for("update");
    const m = all.find((x) => x.userId === userId);
    if (!m) throw notFound("Membro");
    if (input.role && input.role !== "admin" && m.role === "admin" && (await adminCount(ctx.orgId, tx)) <= 1)
      throw new AppError("validation", LAST_ADMIN);
    await assertStoresInOrg(ctx.orgId, input.storeIds, tx);
    const patch: Partial<typeof schema.memberships.$inferInsert> = {};
    if (input.role && input.role !== m.role) patch.role = input.role;
    if (input.storeIds !== undefined) patch.storeIds = input.storeIds && input.storeIds.length ? [...new Set(input.storeIds)] : null;
    const nextRole = patch.role ?? m.role;
    const nextStores = patch.storeIds !== undefined ? patch.storeIds : m.storeIds;
    if (m.role === "admin" && m.storeIds === null && !(nextRole === "admin" && nextStores === null)) {
      const others = (await fullAccessAdmins(ctx.orgId, tx)).filter((id) => id !== userId);
      if (!others.length) throw new AppError("validation", LAST_FULL_ADMIN);
    }
    if (!Object.keys(patch).length) return { ok: true };
    await tx.update(schema.memberships).set(patch).where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, userId)));
    const name = await memberName(userId, tx);
    const parts: string[] = [];
    if (patch.role) parts.push(`papel de ${name} alterado de ${ROLE_LABEL[m.role]} para ${ROLE_LABEL[patch.role]}`);
    if (patch.storeIds !== undefined) {
      parts.push(patch.storeIds === null ? `${name} agora acessa todas as lojas` : `acesso de ${name} limitado a: ${(await storeNames(ctx.orgId, patch.storeIds, tx)).join(", ")}`);
    }
    const summary = parts.join("; ");
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "member.update", entityType: "member", entityId: userId,
      summary: summary.charAt(0).toUpperCase() + summary.slice(1) + ".", data: { role: patch.role, previousRole: patch.role ? m.role : undefined, storeIds: patch.storeIds } });
    return { ok: true };
  });
}

export async function removeMember(ctx: TenantCtx, userId: string) {
  requirePermission(ctx, "members.manage");
  const db = getDb();
  return db.transaction(async (tx) => {
    const all = await tx.select().from(schema.memberships).where(eq(schema.memberships.orgId, ctx.orgId)).for("update");
    const m = all.find((x) => x.userId === userId);
    if (!m) throw notFound("Membro");
    if (m.role === "admin" && (await adminCount(ctx.orgId, tx)) <= 1) throw new AppError("validation", LAST_ADMIN);
    if (m.role === "admin" && m.storeIds === null && !(await fullAccessAdmins(ctx.orgId, tx)).some((id) => id !== userId))
      throw new AppError("validation", LAST_FULL_ADMIN);
    const name = await memberName(userId, tx);
    await tx.delete(schema.memberships).where(and(eq(schema.memberships.orgId, ctx.orgId), eq(schema.memberships.userId, userId)));
    // sessões desse usuário que estavam nesta conta perdem a conta ativa
    await tx.update(schema.sessions).set({ activeOrgId: null }).where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.activeOrgId, ctx.orgId)));
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "member.remove", entityType: "member", entityId: userId, summary: `${name} (${ROLE_LABEL[m.role]}) removido(a) da conta.` });
    return { ok: true };
  });
}

// ---------------- Convites ----------------
export async function listInvitations(ctx: TenantCtx) {
  requirePermission(ctx, "members.manage");
  const rows = await getDb().select({
    id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt,
    acceptedAt: schema.invitations.acceptedAt, revokedAt: schema.invitations.revokedAt, createdAt: schema.invitations.createdAt, invitedBy: schema.invitations.invitedBy,
    invitedByName: schema.users.name,
  }).from(schema.invitations).leftJoin(schema.users, eq(schema.users.id, schema.invitations.invitedBy))
    .where(eq(schema.invitations.orgId, ctx.orgId)).orderBy(desc(schema.invitations.createdAt));
  const now = Date.now();
  return rows.map((r) => ({ ...r, status: r.acceptedAt ? "aceito" : r.revokedAt ? "cancelado" : r.expiresAt.getTime() < now ? "expirado" : "pendente" }));
}

export async function createInvitation(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "members.manage");
  const input = z.object({ email: emailSchema, role: z.enum(ROLES) }).parse(raw);
  const db = getDb();
  const token = randomToken(32);
  const inv = await db.transaction(async (tx) => {
    await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    const [already] = await tx.select({ id: schema.users.id }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, ctx.orgId), sql`lower(${schema.users.email}) = ${input.email}`));
    if (already) throw new AppError("conflict", "Esta pessoa já participa da conta.");
    // convite pendente anterior para o mesmo e-mail é substituído
    await tx.update(schema.invitations).set({ revokedAt: new Date() }).where(and(eq(schema.invitations.orgId, ctx.orgId), eq(schema.invitations.email, input.email), isNull(schema.invitations.acceptedAt), isNull(schema.invitations.revokedAt)));
    await assertUserLimit(ctx.orgId, tx);
    const [row] = await tx.insert(schema.invitations).values({
      id: newId("inv"), orgId: ctx.orgId, email: input.email, role: input.role, tokenHash: sha256(token), invitedBy: ctx.userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000),
    }).returning();
    const [org] = await tx.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId));
    const link = appUrl(`/convite?token=${encodeURIComponent(token)}`);
    await sendEmail({ to: input.email, kind: "invitation", orgId: ctx.orgId, subject: `Convite para ${org!.name}`,
      text: `Você foi convidado(a) para participar da conta "${org!.name}" como ${ROLE_LABEL[input.role]}.\n\nAceite pelo link (válido por ${INVITE_DAYS} dias):\n\n${link}` }, tx);
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "member.invite", entityType: "invitation", entityId: row!.id, summary: `Convite enviado para ${input.email} como ${ROLE_LABEL[input.role]}.` });
    return { row: row!, link };
  });
  // Sem SMTP configurado, o administrador recebe o link para enviar por conta própria (ex.: WhatsApp).
  return {
    id: inv.row.id, email: inv.row.email, role: inv.row.role, expiresAt: inv.row.expiresAt, status: "pendente",
    acceptUrl: process.env.SMTP_URL ? null : inv.link,
  };
}

export async function revokeInvitation(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "members.manage");
  const db = getDb();
  const [row] = await db.update(schema.invitations).set({ revokedAt: new Date() })
    .where(and(eq(schema.invitations.id, id), eq(schema.invitations.orgId, ctx.orgId), isNull(schema.invitations.acceptedAt))).returning();
  if (!row) throw notFound("Convite");
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "member.invite_revoke", entityType: "invitation", entityId: id, summary: `Convite para ${row.email} cancelado.` });
  return { ok: true };
}

/**
 * Reenvia um convite pendente ou expirado: gera um novo link (o anterior deixa de valer) e renova a validade.
 * Convite aceito ou cancelado não pode ser reenviado (crie um novo).
 */
export async function resendInvitation(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "members.manage");
  const db = getDb();
  const token = randomToken(32);
  const res = await db.transaction(async (tx) => {
    await tx.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    const [inv] = await tx.select().from(schema.invitations).where(and(eq(schema.invitations.id, id), eq(schema.invitations.orgId, ctx.orgId))).for("update");
    if (!inv) throw notFound("Convite");
    if (inv.acceptedAt) throw new AppError("validation", "Este convite já foi aceito.");
    if (inv.revokedAt) throw new AppError("validation", "Este convite foi cancelado. Envie um novo convite.");
    // convite expirado volta a ocupar uma vaga do plano
    if (inv.expiresAt.getTime() <= Date.now()) await assertUserLimit(ctx.orgId, tx);
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000);
    await tx.update(schema.invitations).set({ tokenHash: sha256(token), expiresAt }).where(eq(schema.invitations.id, id));
    const [org] = await tx.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId));
    const link = appUrl(`/convite?token=${encodeURIComponent(token)}`);
    await sendEmail({ to: inv.email, kind: "invitation", orgId: ctx.orgId, subject: `Convite para ${org!.name}`,
      text: `Você foi convidado(a) para participar da conta "${org!.name}" como ${ROLE_LABEL[inv.role]}.\n\nAceite pelo link (válido por ${INVITE_DAYS} dias):\n\n${link}` }, tx);
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "member.invite_resend", entityType: "invitation", entityId: id, summary: `Convite para ${inv.email} reenviado.` });
    return { inv, link, expiresAt };
  });
  return {
    id, email: res.inv.email, role: res.inv.role, expiresAt: res.expiresAt, status: "pendente",
    acceptUrl: process.env.SMTP_URL ? null : res.link,
  };
}

async function findValidInvitation(token: string, db: Executor) {
  const [row] = await db.select({ inv: schema.invitations, orgName: schema.organizations.name }).from(schema.invitations)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invitations.orgId))
    .where(and(eq(schema.invitations.tokenHash, sha256(token)), isNull(schema.invitations.acceptedAt), isNull(schema.invitations.revokedAt),
      gt(schema.invitations.expiresAt, new Date()), isNull(schema.organizations.deletedAt)));
  return row ?? null;
}

const INVALID_INVITE = "Este convite expirou, foi cancelado ou já foi usado. Peça um novo convite ao administrador.";

/** Dados públicos do convite para a tela de aceite. */
export async function lookupInvitation(token: string) {
  const row = token ? await findValidInvitation(token, getDb()) : null;
  if (!row) throw new AppError("not_found", INVALID_INVITE);
  const [u] = await getDb().select({ id: schema.users.id }).from(schema.users).where(and(sql`lower(${schema.users.email}) = ${row.inv.email}`, isNull(schema.users.deletedAt)));
  return { orgName: row.orgName, email: row.inv.email, role: row.inv.role, userExists: !!u, expiresAt: row.inv.expiresAt };
}

const acceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, "Informe seu nome.").max(80).optional(),
  password: z.string().max(200).optional(),
});

/**
 * Aceita um convite.
 * - Logado com o e-mail convidado: só cria o vínculo.
 * - Não logado, usuário existe: exige a senha da conta (entra e aceita).
 * - Não logado, usuário novo: exige nome e senha (cria usuário e aceita).
 * Retorna token de nova sessão quando o usuário não estava logado.
 */
export async function acceptInvitation(raw: unknown, current: UserCtx | null, meta: { userAgent?: string | null } = {}) {
  const input = acceptSchema.parse(raw);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const row = await findValidInvitation(input.token, tx);
    if (!row) throw new AppError("not_found", INVALID_INVITE);
    const inv = row.inv;
    await tx.select({ id: schema.invitations.id }).from(schema.invitations).where(eq(schema.invitations.id, inv.id)).for("update");
    const [existing] = await tx.select().from(schema.users).where(and(sql`lower(${schema.users.email}) = ${inv.email}`, isNull(schema.users.deletedAt)));
    let userId: string;
    let needsSession = false;
    if (current) {
      if (current.email.toLowerCase() !== inv.email) throw new AppError("forbidden", `Este convite é para ${inv.email}. Entre com esse e-mail para aceitar.`);
      userId = current.userId;
    } else if (existing) {
      if (!input.password || !(await verifyPassword(input.password, existing.passwordHash)))
        throw new AppError("unauthenticated", "Senha incorreta. Use a senha da sua conta para aceitar o convite.");
      userId = existing.id; needsSession = true;
    } else {
      if (!input.name) throw new AppError("validation", "Informe seu nome.");
      const password = passwordSchema.parse(input.password ?? "");
      userId = newId("usr");
      await tx.insert(schema.users).values({ id: userId, email: inv.email, name: input.name, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() });
      needsSession = true;
    }
    const [member] = await tx.select({ userId: schema.memberships.userId }).from(schema.memberships).where(and(eq(schema.memberships.orgId, inv.orgId), eq(schema.memberships.userId, userId)));
    if (!member) {
      await assertUserLimit(inv.orgId, tx, { countingInvitation: true });
      await tx.insert(schema.memberships).values({ orgId: inv.orgId, userId, role: inv.role });
    }
    await tx.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.id));
    await writeAudit(tx, { orgId: inv.orgId, userId, action: "member.join", entityType: "member", entityId: userId, summary: `${inv.email} aceitou o convite como ${ROLE_LABEL[inv.role]}.` });
    return { userId, orgId: inv.orgId, needsSession };
  });
  const token = result.needsSession ? await createSession(result.userId, result.orgId, meta.userAgent) : null;
  return { ...result, token };
}
