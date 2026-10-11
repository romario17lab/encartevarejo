import type { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { assertOrgNotSuspended, type TenantCtx, type UserCtx } from "../context";
import { AppError } from "../errors";
import { getDb, schema } from "../db";
import { randomToken, sha256 } from "../signing";

export const SESSION_COOKIE = "ev_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;
/** só renova a validade (e o cookie) se a última renovação tiver mais de 1 dia */
const REFRESH_AFTER_MS = 24 * 3600 * 1000;

export function sessionCookieOptions(maxAgeSec = SESSION_DAYS * 24 * 3600) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** Cria a sessão no banco (só o sha256 do token é salvo) e devolve o token para o cookie. */
export async function createSession(userId: string, activeOrgId: string | null, userAgent?: string | null): Promise<string> {
  const token = randomToken(32);
  await getDb().insert(schema.sessions).values({
    id: sha256(token), userId, activeOrgId, expiresAt: new Date(Date.now() + SESSION_MS),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });
  return token;
}

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}

async function readToken(req?: NextRequest | Request): Promise<string | null> {
  if (req) {
    const anyReq = req as NextRequest;
    if (anyReq.cookies?.get) return anyReq.cookies.get(SESSION_COOKIE)?.value ?? null;
    const raw = req.headers.get("cookie") ?? "";
    const m = raw.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    return m ? decodeURIComponent(m.slice(SESSION_COOKIE.length + 1)) : null;
  }
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  } catch { return null; }
}

export interface ResolvedSession {
  sessionId: string;
  activeOrgId: string | null;
  user: UserCtx;
}

/** Sessão válida a partir do cookie (ou null). Renova a validade de forma deslizante. */
export async function resolveSession(req?: NextRequest | Request): Promise<ResolvedSession | null> {
  const token = await readToken(req);
  if (!token || token.length < 20 || token.length > 200) return null;
  const id = sha256(token);
  const db = getDb();
  const now = new Date();
  const [row] = await db.select({
    sessionId: schema.sessions.id, activeOrgId: schema.sessions.activeOrgId, expiresAt: schema.sessions.expiresAt,
    userId: schema.users.id, email: schema.users.email, name: schema.users.name, isPlatformAdmin: schema.users.isPlatformAdmin,
  }).from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, now), isNull(schema.users.deletedAt)));
  if (!row) return null;
  if (row.expiresAt.getTime() - now.getTime() < SESSION_MS - REFRESH_AFTER_MS) {
    await db.update(schema.sessions).set({ expiresAt: new Date(now.getTime() + SESSION_MS) }).where(eq(schema.sessions.id, id));
    // em Route Handlers o cookie também é renovado; em outros contextos isso não é permitido e é ignorado
    try {
      const { cookies } = await import("next/headers");
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
    } catch { /* fora de um Route Handler */ }
  }
  return {
    sessionId: row.sessionId, activeOrgId: row.activeOrgId,
    user: { userId: row.userId, email: row.email, name: row.name, isPlatformAdmin: row.isPlatformAdmin },
  };
}

/** Lê o cookie de sessão, valida no banco e retorna o usuário. Lança AppError("unauthenticated"). */
export async function getUserCtx(req?: NextRequest): Promise<UserCtx> {
  const s = await resolveSession(req);
  if (!s) throw new AppError("unauthenticated", "Faça login para continuar.");
  return s.user;
}

/** Vínculo do usuário com uma conta ativa (não excluída). */
export async function findMembership(userId: string, orgId: string) {
  const [m] = await getDb().select({ role: schema.memberships.role, storeIds: schema.memberships.storeIds })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.orgId, orgId), isNull(schema.organizations.deletedAt)));
  return m ?? null;
}

/** Primeira conta (mais antiga) de que o usuário participa. */
export async function firstOrgOf(userId: string): Promise<string | null> {
  const [m] = await getDb().select({ orgId: schema.memberships.orgId }).from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), isNull(schema.organizations.deletedAt)))
    .orderBy(asc(schema.memberships.createdAt)).limit(1);
  return m?.orgId ?? null;
}

/** Usuário + conta ativa + papel. Lança "unauthenticated" ou "forbidden". Papel lido do banco a cada requisição. */
export async function getTenantCtx(req?: NextRequest): Promise<TenantCtx> {
  const s = await resolveSession(req);
  if (!s) throw new AppError("unauthenticated", "Faça login para continuar.");
  let orgId = s.activeOrgId;
  let m = orgId ? await findMembership(s.user.userId, orgId) : null;
  if (!m) {
    orgId = await firstOrgOf(s.user.userId);
    if (!orgId) throw new AppError("forbidden", "Você não participa de nenhuma conta ativa.");
    m = await findMembership(s.user.userId, orgId);
    if (!m) throw new AppError("forbidden", "Você não participa de nenhuma conta ativa.");
    await getDb().update(schema.sessions).set({ activeOrgId: orgId }).where(eq(schema.sessions.id, s.sessionId));
  }
  await assertOrgNotSuspended(orgId!, req); // conta suspensa pela administração → 403 account_suspended
  return { userId: s.user.userId, orgId: orgId!, role: m.role, storeIds: m.storeIds ?? null, isPlatformAdmin: s.user.isPlatformAdmin };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}
