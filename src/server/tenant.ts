import "./zod-pt";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { can, type Permission } from "@/domain/campaign";
import type { TenantCtx } from "./context";
import { AppError, forbidden, notFound } from "./errors";
import { getDb, schema } from "./db";
import type { Executor } from "./db/tx";

// Isolamento por conta (tenant). Toda consulta de dados de cliente usa ctx.orgId vindo da sessão.

/** Exige uma permissão do papel atual. */
export function requirePermission(ctx: TenantCtx, p: Permission): void {
  if (!can(ctx.role, p)) throw forbidden();
}

/** Condição `org_id = ctx.orgId` para qualquer tabela com org_id. */
export function inOrg(ctx: TenantCtx, column: AnyPgColumn): SQL {
  return eq(column, ctx.orgId);
}

/** Condição de lojas permitidas (membros restritos a filiais). undefined = todas. */
export function storeScope(ctx: TenantCtx, storeColumn: AnyPgColumn): SQL | undefined {
  if (ctx.storeIds === null) return undefined;
  if (ctx.storeIds.length === 0) return eq(storeColumn, "__nenhuma__");
  return inArray(storeColumn, ctx.storeIds);
}

export function canAccessStore(ctx: TenantCtx, storeId: string): boolean {
  return ctx.storeIds === null || ctx.storeIds.includes(storeId);
}

/** Carrega uma loja da conta (não excluída) e verifica se o membro tem acesso a ela. */
export async function getAccessibleStore(ctx: TenantCtx, storeId: string, db: Executor = getDb()) {
  const [store] = await db.select().from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.orgId, ctx.orgId), isNull(schema.stores.deletedAt)));
  if (!store) throw notFound("Loja");
  if (!canAccessStore(ctx, storeId)) throw new AppError("forbidden", "Você não tem acesso a esta loja.");
  return store;
}
