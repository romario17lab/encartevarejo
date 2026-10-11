import type { Role, Permission } from "@/domain/campaign";

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
