import "./zod-pt";
import { NextResponse, type NextRequest } from "next/server";
import type { UserCtx } from "./context";
import { AppError } from "./errors";
import { jsonError } from "./http";
import { resolveSession } from "./auth/session";

// Rotas da administração da plataforma (/api/admin/**). A sessão é validada no banco a cada
// requisição e `users.is_platform_admin` é relido junto (resolveSession). Quem não é administrador
// da plataforma — inclusive sem sessão — recebe 404, para não revelar que a área existe.

type RouteParams = { params: Promise<Record<string, string>> };

export const ADMIN_NOT_FOUND_MESSAGE = "Página não encontrada.";

/** Usuário administrador da plataforma ou lança 404. */
export async function requirePlatformAdmin(req?: NextRequest): Promise<UserCtx> {
  const s = await resolveSession(req);
  if (!s || !s.user.isPlatformAdmin) throw new AppError("not_found", ADMIN_NOT_FOUND_MESSAGE);
  return s.user;
}

export function platformAdminRoute(handler: (req: NextRequest, admin: UserCtx, params: Record<string, string>) => Promise<Response | unknown>) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const admin = await requirePlatformAdmin(req);
      const res = await handler(req, admin, (await route?.params) ?? {});
      const out = res instanceof Response ? res : NextResponse.json(res ?? { ok: true });
      out.headers.set("cache-control", "no-store");
      return out;
    } catch (e) { return jsonError(e); }
  };
}
