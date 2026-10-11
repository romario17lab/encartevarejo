import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "./errors";
import { assertOrgNotSuspended } from "./context";
import { jsonError } from "./http";
import { clientIp, hitRateLimit } from "./auth/rate-limit";
import { assertWritable } from "./services/subscriptions";
import { authenticateApiToken, type ApiScope, type ApiTokenCtx } from "./services/api-tokens";

// Rotas da API pública v1 (integrações), autenticadas por token Bearer — não por cookie de sessão.
// - Isolamento: a conta vem SEMPRE do token (nunca do corpo ou da URL).
// - Escopo exigido por rota; token revogado/inexistente → 401.
// - Limite: API_RATE_LIMIT requisições por minuto por token (padrão 120) e 30 tentativas inválidas por minuto por IP.
// - Conta suspensa → 403; conta somente leitura (assinatura) → escritas bloqueadas com 402, como em tenantRoute.

type RouteParams = { params: Promise<Record<string, string>> };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const API_RATE_LIMIT = () => Math.max(1, Number(process.env.API_RATE_LIMIT ?? 120) || 120);

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

function withHeaders(res: NextResponse): NextResponse {
  res.headers.set("cache-control", "no-store");
  if (res.status === 429) res.headers.set("retry-after", "60");
  if (res.status === 401) res.headers.set("www-authenticate", 'Bearer realm="api"');
  return res;
}

export function apiTokenRoute(
  handler: (req: NextRequest, api: ApiTokenCtx, params: Record<string, string>) => Promise<Response | unknown>,
  opts: { scope: ApiScope | ApiScope[] },
) {
  return async (req: NextRequest, route: RouteParams) => {
    try {
      const token = bearer(req);
      const api = token ? await authenticateApiToken(token) : null;
      if (!api) {
        hitRateLimit(`api-bad:${clientIp(req)}`, 30, 60_000);
        throw new AppError("unauthenticated", "Token de API ausente, inválido ou revogado. Envie o cabeçalho Authorization: Bearer <token>.");
      }
      hitRateLimit(`api:${api.tokenId}`, API_RATE_LIMIT(), 60_000);
      const needed = Array.isArray(opts.scope) ? opts.scope : [opts.scope];
      const missing = needed.filter((s) => !api.scopes.includes(s));
      if (missing.length) throw new AppError("forbidden", `Este token não tem a permissão necessária (${missing.join(", ")}).`);
      await assertOrgNotSuspended(api.orgId, null);
      if (!SAFE_METHODS.has(req.method)) await assertWritable(api.orgId);
      const res = await handler(req, api, (await route?.params) ?? {});
      return withHeaders(res instanceof NextResponse ? res : res instanceof Response ? new NextResponse(res.body, res) : NextResponse.json(res ?? { ok: true }));
    } catch (e) { return withHeaders(jsonError(e)); }
  };
}
