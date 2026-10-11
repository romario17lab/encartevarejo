// STUB do coordenador — o Agente de Backend substitui a implementação mantendo as assinaturas.
import type { NextRequest } from "next/server";
import type { TenantCtx, UserCtx } from "../context";
import { AppError } from "../errors";

export const SESSION_COOKIE = "ev_session";

/** Lê o cookie de sessão, valida no banco e retorna o usuário. Lança AppError("unauthenticated"). */
export async function getUserCtx(_req?: NextRequest): Promise<UserCtx> {
  throw new AppError("unauthenticated", "Faça login para continuar.");
}

/** Usuário + conta ativa + papel. Lança "unauthenticated" ou "forbidden". */
export async function getTenantCtx(_req?: NextRequest): Promise<TenantCtx> {
  throw new AppError("unauthenticated", "Faça login para continuar.");
}
