// Registro de ações da administração da plataforma (admin_audit_log), separado do audit_log das contas.
import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db";
import type { Executor } from "../../db/tx";

const SENSITIVE_KEY = /password|senha|token|secret|segredo|hash|cookie|session|card|cartao|cvv|cpf|cnpj|document/i;

/** Remove chaves sensíveis (senhas, tokens, sessões, dados de cartão/documento) de forma recursiva. */
export function scrubSensitive(v: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => scrubSensitive(x, depth + 1));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = scrubSensitive(val, depth + 1);
    }
    return out;
  }
  if (typeof v === "string" && v.length > 2000) return `${v.slice(0, 2000)}…`;
  return v;
}

export interface AdminAuditEntry {
  adminUserId: string;
  action: string;
  targetType: "organization" | "plan" | "template" | "template_version" | "export_job" | "user";
  targetId?: string | null;
  details?: Record<string, unknown>;
}

export async function writeAdminAudit(db: Executor, e: AdminAuditEntry): Promise<void> {
  await db.insert(schema.adminAuditLog).values({
    adminUserId: e.adminUserId, action: e.action, targetType: e.targetType, targetId: e.targetId ?? null,
    details: (scrubSensitive(e.details ?? {}) as Record<string, unknown>) ?? {},
  });
}

export const ADMIN_ACTION_LABEL: Record<string, string> = {
  "plan.create": "Plano criado",
  "plan.update": "Plano alterado",
  "template.settings": "Modelo configurado",
  "template.publish": "Versão de modelo publicada",
  "template.unpublish": "Versão de modelo despublicada",
  "org.plan_change": "Plano da conta alterado manualmente",
  "org.trial_extend": "Período de teste estendido",
  "org.suspend": "Conta suspensa",
  "org.reactivate": "Conta reativada",
  "export.retry": "Exportação reenviada",
  "user.grant_admin": "Acesso de administração concedido",
  "user.revoke_admin": "Acesso de administração removido",
};

const listSchema = z.object({
  action: z.string().max(60).optional(),
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(80).optional(),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listAdminAudit(raw: Record<string, unknown>) {
  const q = listSchema.parse(raw);
  const conds: SQL[] = [];
  if (q.action) conds.push(eq(schema.adminAuditLog.action, q.action));
  if (q.targetType) conds.push(eq(schema.adminAuditLog.targetType, q.targetType));
  if (q.targetId) conds.push(eq(schema.adminAuditLog.targetId, q.targetId));
  if (q.before) conds.push(lt(schema.adminAuditLog.id, q.before));
  const rows = await getDb().select({
    id: schema.adminAuditLog.id, action: schema.adminAuditLog.action, targetType: schema.adminAuditLog.targetType,
    targetId: schema.adminAuditLog.targetId, details: schema.adminAuditLog.details, createdAt: schema.adminAuditLog.createdAt,
    adminUserId: schema.adminAuditLog.adminUserId, adminName: schema.users.name, adminEmail: schema.users.email,
  }).from(schema.adminAuditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.adminAuditLog.adminUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.adminAuditLog.id)).limit(q.limit + 1);
  const more = rows.length > q.limit;
  const items = rows.slice(0, q.limit).map((r) => ({ ...r, actionLabel: ADMIN_ACTION_LABEL[r.action] ?? r.action, details: scrubSensitive(r.details) }));
  return { items, nextBefore: more ? items[items.length - 1]!.id : null, actions: Object.entries(ADMIN_ACTION_LABEL).map(([value, label]) => ({ value, label })) };
}
