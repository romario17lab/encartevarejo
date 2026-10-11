import type { Role, Permission } from "@/domain/campaign";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { AppError } from "./errors";

/**
 * Contexto de uma requisição autenticada dentro de uma conta (tenant).
 * Todo serviço que lê/escreve dados de cliente recebe um TenantCtx e filtra por ctx.orgId.
 * Implementação de obtenção (cookie de sessão -> ctx) em src/server/auth/session.ts (Agente de Backend).
 */
export interface TenantCtx {
  userId: string;
  orgId: string;
  role: Role;
  /** null = todas as lojas da conta */
  storeIds: string[] | null;
  isPlatformAdmin: boolean;
}

export interface UserCtx {
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export type { Role, Permission };

// ---------------- Suspensão de conta (administração da plataforma) ----------------

export const ACCOUNT_SUSPENDED = "account_suspended" as const;

/** Conta suspensa pela administração. HTTP 403 com código "account_suspended". */
export class AccountSuspendedError extends AppError {
  constructor() {
    super("forbidden", "Esta conta está suspensa pela administração da plataforma. Fale com o suporte para reativar. Você ainda pode baixar a exportação dos dados da conta.");
    // código próprio (fora da união ErrorCode, que é contrato do coordenador); o status continua 403
    (this as unknown as { code: string }).code = ACCOUNT_SUSPENDED;
  }
}

/** Rotas de conta que continuam disponíveis com a conta suspensa (somente leitura). /api/me não usa o contexto de conta. */
const SUSPENDED_ALLOWED: Array<{ method: string; path: RegExp }> = [
  { method: "GET", path: /^\/api\/org\/export\/?$/ },
];

/** Lança AccountSuspendedError se a conta estiver suspensa, exceto nas rotas liberadas acima. */
export async function assertOrgNotSuspended(orgId: string, req?: { method?: string; url?: string; nextUrl?: { pathname: string } } | null): Promise<void> {
  const [org] = await getDb().select({ suspendedAt: schema.organizations.suspendedAt }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!org?.suspendedAt) return;
  if (req) {
    const method = (req.method ?? "GET").toUpperCase();
    let path = req.nextUrl?.pathname;
    if (!path && req.url) { try { path = new URL(req.url, "http://localhost").pathname; } catch { path = undefined; } }
    if (path && SUSPENDED_ALLOWED.some((a) => a.method === method && a.path.test(path!))) return;
  }
  throw new AccountSuspendedError();
}
