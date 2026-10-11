import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { TenantCtx } from "@/server/context";
import type { Role } from "@/domain/campaign";
import { ensurePlans } from "@/server/services/plans";
import { signup } from "@/server/services/auth";
import { newId } from "@/server/ids";
import { createSession } from "@/server/auth/session";
import { listTemplates, DEFAULT_TEMPLATE_ID } from "@/templates/registry";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);
export const uid = () => nano();
export const PASSWORD = "senha-forte-123";

let plansReady = false;
export async function ready() {
  if (!plansReady) { await ensurePlans(); plansReady = true; }
}

export interface TestOrg { ctx: TenantCtx; token: string; orgId: string; userId: string; storeId: string; email: string }

/** Cria conta completa via serviço de cadastro (usuário admin + conta + loja). */
export async function makeOrg(opts: { plan?: string; orgName?: string } = {}): Promise<TestOrg> {
  await ready();
  const email = `adm-${uid()}@teste.com`;
  const r = await signup({ name: "Admin Teste", email, password: PASSWORD, orgName: opts.orgName ?? `Mercado ${uid()}`, storeName: `Loja ${uid()}` });
  if (opts.plan) await getDb().update(schema.organizations).set({ planId: opts.plan }).where(eq(schema.organizations.id, r.orgId));
  return { ctx: { userId: r.userId, orgId: r.orgId, role: "admin", storeIds: null, isPlatformAdmin: false }, token: r.token, orgId: r.orgId, userId: r.userId, storeId: r.storeId, email };
}

/** Adiciona um membro com papel (direto no banco) e devolve ctx + token de sessão. */
export async function addMember(org: TestOrg, role: Role, storeIds: string[] | null = null) {
  const userId = newId("usr");
  await getDb().insert(schema.users).values({ id: userId, email: `${role}-${uid()}@teste.com`, name: `${role} teste`, passwordHash: "x" });
  await getDb().insert(schema.memberships).values({ orgId: org.orgId, userId, role, storeIds });
  const token = await createSession(userId, org.orgId);
  const ctx: TenantCtx = { userId, orgId: org.orgId, role, storeIds, isPlatformAdmin: false };
  return { ctx, token, userId };
}

export function templateId() {
  return listTemplates()[0]?.id ?? DEFAULT_TEMPLATE_ID;
}

/** Monta uma NextRequest com cookie de sessão. */
export function req(method: string, url: string, opts: { token?: string | null; body?: unknown; form?: FormData; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.cookie = `ev_session=${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["content-type"] = "application/json"; }
  return new NextRequest(new URL(url, "http://localhost:3101"), { method, headers, body });
}

type Handler = (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
/** Chama um route handler com parâmetros de rota. */
export async function call(handler: unknown, r: NextRequest, params: Record<string, string> = {}) {
  const res = await (handler as Handler)(r, { params: Promise.resolve(params) });
  const text = await res.clone().text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* binário */ }
  return { status: res.status, json, res };
}

export function days(n: number, from = new Date()) { return new Date(from.getTime() + n * 86400000); }

export async function makeProduct(org: TestOrg, data: Record<string, unknown> = {}) {
  const { createProduct } = await import("@/server/services/products");
  return createProduct(org.ctx, { name: `Produto ${uid()}`, unit: "un", regularCents: 999, promoCents: 799, ...data });
}
