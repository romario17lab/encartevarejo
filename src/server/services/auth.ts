import "../zod-pt";
import { z } from "zod";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { ROLE_PERMISSIONS } from "@/domain/campaign";
import type { UserCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { newId } from "../ids";
import { randomToken, sha256 } from "../signing";
import { writeAudit } from "../audit";
import { appUrl, sendEmail } from "../email";
import { burnPasswordCheck, hashPassword, PASSWORD_MIN, verifyPassword } from "../auth/password";
import { hitRateLimit, resetRateLimit } from "../auth/rate-limit";
import { createSession, findMembership, firstOrgOf } from "../auth/session";
import { insertBrandKit } from "./brand-kits";
import { insertStore, storeInputSchema } from "./stores";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")).pipe(z.string().max(160));
export const passwordSchema = z.string().min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`).max(200, "Senha longa demais.");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80),
  email: emailSchema,
  password: passwordSchema,
  orgName: z.string().trim().min(2, "Informe o nome do mercado.").max(80),
  storeName: z.string().trim().min(2, "Informe o nome da loja.").max(80),
  segment: z.string().trim().max(40).optional().default("supermercado"),
});

async function findUserByEmail(email: string) {
  const [u] = await getDb().select().from(schema.users).where(and(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`, isNull(schema.users.deletedAt)));
  return u ?? null;
}

/** Cria usuário, conta (plano inicial), identidade visual, 1ª loja e vínculo admin. Retorna token de sessão. */
export async function signup(raw: unknown, meta: { userAgent?: string | null } = {}) {
  const input = signupSchema.parse(raw);
  if (await findUserByEmail(input.email)) throw new AppError("conflict", "Já existe uma conta com este e-mail. Entre ou recupere sua senha.");
  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const userId = newId("usr");
    try {
      await tx.insert(schema.users).values({ id: userId, email: input.email, name: input.name, passwordHash });
    } catch {
      throw new AppError("conflict", "Já existe uma conta com este e-mail. Entre ou recupere sua senha.");
    }
    const orgId = newId("org");
    await tx.insert(schema.organizations).values({ id: orgId, name: input.orgName, planId: "inicial" });
    const bk = await insertBrandKit(orgId, input.orgName, tx);
    const store = await insertStore(orgId, storeInputSchema.parse({ name: input.storeName, segment: input.segment, brandKitId: bk.id }), tx);
    await tx.insert(schema.memberships).values({ orgId, userId, role: "admin" });
    await writeAudit(tx, { orgId, userId, action: "org.create", entityType: "organization", entityId: orgId, summary: `Conta "${input.orgName}" criada por ${input.name}.` });
    return { userId, orgId, storeId: store.id };
  });
  const token = await createSession(result.userId, result.orgId, meta.userAgent);
  return { token, ...result };
}

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Informe a senha.").max(200) });

export async function login(raw: unknown, meta: { ip: string; userAgent?: string | null }) {
  const input = loginSchema.parse(raw);
  const key = `login:${meta.ip}:${input.email}`;
  hitRateLimit(key, 10, 15 * 60 * 1000);
  const user = await findUserByEmail(input.email);
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new AppError("unauthenticated", "E-mail ou senha incorretos.");
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw new AppError("unauthenticated", "E-mail ou senha incorretos.");
  resetRateLimit(key);
  const orgId = await firstOrgOf(user.id);
  const token = await createSession(user.id, orgId, meta.userAgent);
  await writeAudit(getDb(), { orgId, userId: user.id, action: "auth.login", entityType: "user", entityId: user.id, summary: `${user.name} entrou no sistema.` });
  return { token, userId: user.id, orgId };
}

const FORGOT_MESSAGE = "Se existir uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira sua caixa de entrada.";

export async function forgotPassword(raw: unknown, meta: { ip: string }) {
  const { email } = z.object({ email: emailSchema }).parse(raw);
  hitRateLimit(`forgot:${meta.ip}:${email}`, 5, 15 * 60 * 1000);
  const user = await findUserByEmail(email);
  if (user) {
    const token = randomToken(32);
    const db = getDb();
    await db.insert(schema.passwordResets).values({ id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3600 * 1000) });
    const link = appUrl(`/redefinir-senha?token=${encodeURIComponent(token)}`);
    await sendEmail({
      to: user.email, kind: "password_reset", subject: "Crie uma nova senha",
      text: `Olá, ${user.name}!\n\nRecebemos um pedido para criar uma nova senha. Use o link abaixo (válido por 1 hora, uso único):\n\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
    });
  }
  return { ok: true, message: FORGOT_MESSAGE };
}

export async function resetPassword(raw: unknown) {
  const input = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(raw);
  const db = getDb();
  const id = sha256(input.token);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    // uso único: a linha só é marcada se ainda não usada e dentro da validade
    const [row] = await tx.update(schema.passwordResets).set({ usedAt: new Date() })
      .where(and(eq(schema.passwordResets.id, id), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
      .returning();
    if (!row) throw new AppError("validation", "Este link expirou ou já foi usado. Peça um novo link de recuperação.");
    await tx.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, row.userId));
    // invalida sessões existentes e outros links pendentes
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
    await tx.update(schema.passwordResets).set({ usedAt: new Date() }).where(and(eq(schema.passwordResets.userId, row.userId), isNull(schema.passwordResets.usedAt)));
    await writeAudit(tx, { orgId: null, userId: row.userId, action: "auth.password_reset", entityType: "user", entityId: row.userId, summary: "Senha redefinida pelo link de recuperação." });
    return { ok: true };
  });
}

/** Dados da tela inicial: usuário, conta ativa, papel, contas, lojas visíveis e permissões. */
export async function getMe(user: UserCtx, activeOrgId: string | null) {
  const db = getDb();
  const orgs = await db.select({ id: schema.organizations.id, name: schema.organizations.name, role: schema.memberships.role, isDemo: schema.organizations.isDemo })
    .from(schema.memberships).innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, user.userId), isNull(schema.organizations.deletedAt)))
    .orderBy(asc(schema.memberships.createdAt));
  const orgId: string | null = activeOrgId && orgs.some((o) => o.id === activeOrgId) ? activeOrgId : orgs[0]?.id ?? null;
  const base = { user: { id: user.userId, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin }, orgs };
  if (!orgId) return { ...base, org: null, role: null, stores: [], permissions: [] };
  const m = await findMembership(user.userId, orgId);
  if (!m) return { ...base, org: null, role: null, stores: [], permissions: [] };
  const [org] = await db.select({ org: schema.organizations, plan: schema.plans }).from(schema.organizations)
    .innerJoin(schema.plans, eq(schema.plans.id, schema.organizations.planId)).where(eq(schema.organizations.id, orgId));
  const stores = (await db.select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug, brandKitId: schema.stores.brandKitId })
    .from(schema.stores).where(and(eq(schema.stores.orgId, orgId), isNull(schema.stores.deletedAt))).orderBy(asc(schema.stores.createdAt)))
    .filter((s) => m.storeIds === null || m.storeIds.includes(s.id));
  return {
    ...base,
    org: { id: org!.org.id, name: org!.org.name, kind: org!.org.kind, isDemo: org!.org.isDemo, settings: org!.org.settings, plan: { id: org!.plan.id, name: org!.plan.name, limits: org!.plan.limits } },
    role: m.role, storeIds: m.storeIds, stores, permissions: ROLE_PERMISSIONS[m.role],
  };
}

export async function setActiveOrg(user: UserCtx, sessionId: string, raw: unknown) {
  const { orgId } = z.object({ orgId: z.string().min(1) }).parse(raw);
  const m = await findMembership(user.userId, orgId);
  if (!m) throw new AppError("forbidden", "Você não participa desta conta.");
  await getDb().update(schema.sessions).set({ activeOrgId: orgId }).where(eq(schema.sessions.id, sessionId));
  return { ok: true, orgId };
}
