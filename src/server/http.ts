import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import type { TenantCtx, UserCtx } from "./context";
import { can, type Permission } from "@/domain/campaign";
import { getTenantCtx, getUserCtx } from "./auth/session";
import { assertWritable } from "./services/subscriptions";

// Escritas que continuam liberadas quando a conta está somente leitura (assinatura encerrada,
// inadimplente após a carência ou conta suspensa): cobrança, exportação e exclusão dos dados da conta.
// Entrar/sair e trocar de conta usam publicRoute/userRoute e não passam por aqui.
const WRITE_ALLOWED_WHEN_READ_ONLY: Array<{ method?: string; path: RegExp }> = [
  { path: /^\/api\/billing(\/|$)/ },
  { path: /^\/api\/org\/export$/ },
  { method: "DELETE", path: /^\/api\/org$/ },
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function writeAllowedWhenReadOnly(req: NextRequest): boolean {
  const path = new URL(req.url).pathname;
  return WRITE_ALLOWED_WHEN_READ_ONLY.some((r) => r.path.test(path) && (!r.method || r.method === req.method));
}

// Envelope padrão das rotas da API. Erros sempre como { error: { code, message, details? } }.

type RouteParams = { params: Promise<Record<string, string>> };

export function jsonError(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "validation", message: "Confira os campos informados.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 422 });
  }
  console.error("[api] erro inesperado:", e instanceof Error ? e.stack ?? e.message : e);
  return NextResponse.json({ error: { code: "internal", message: "Erro inesperado. Tente novamente em instantes." } }, { status: 500 });
}

/** Rota que exige usuário logado E conta ativa; opcionalmente uma permissão. */
export function tenantRoute(
  handler: (req: NextRequest, ctx: TenantCtx, params: Record<string, string>) => Promise<Response | unknown>,
  opts: { permission?: Permission } = {},
) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const ctx = await getTenantCtx(req);
      if (opts.permission && !can(ctx.role, opts.permission)) throw new AppError("forbidden", "Você não tem permissão para esta ação.");
      // assinatura: conta somente leitura bloqueia escritas (402 subscription_inactive), salvo a lista acima
      if (!SAFE_METHODS.has(req.method) && !writeAllowedWhenReadOnly(req)) await assertWritable(ctx.orgId);
      const res = await handler(req, ctx, (await route?.params) ?? {});
      return res instanceof Response ? res : NextResponse.json(res ?? { ok: true });
    } catch (e) { return jsonError(e); }
  };
}

/** Rota que exige apenas usuário logado (sem conta específica). */
export function userRoute(handler: (req: NextRequest, user: UserCtx, params: Record<string, string>) => Promise<Response | unknown>) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const user = await getUserCtx(req);
      const res = await handler(req, user, (await route?.params) ?? {});
      return res instanceof Response ? res : NextResponse.json(res ?? { ok: true });
    } catch (e) { return jsonError(e); }
  };
}

/** Rota pública (vitrine, login). */
export function publicRoute(handler: (req: NextRequest, params: Record<string, string>) => Promise<Response | unknown>) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const res = await handler(req, (await route?.params) ?? {});
      return res instanceof Response ? res : NextResponse.json(res ?? { ok: true });
    } catch (e) { return jsonError(e); }
  };
}
