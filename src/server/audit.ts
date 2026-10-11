import { schema } from "./db";
import type { Executor } from "./db/tx";

export interface AuditEntry {
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** frase em português, sem custos, senhas ou tokens */
  summary: string;
  data?: Record<string, unknown> | null;
}

const FORBIDDEN_KEYS = /cost|password|token|secret|hash$/i;

/** Remove chaves sensíveis (custo, senha, token) de forma recursiva antes de gravar. */
function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.test(k) && !/^(approvedHash|contentHash|previousApprovedHash)$/.test(k)) continue;
      out[k] = scrub(val);
    }
    return out;
  }
  return v;
}

export async function writeAudit(db: Executor, e: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    orgId: e.orgId, userId: e.userId, action: e.action, entityType: e.entityType,
    entityId: e.entityId ?? null, summary: e.summary, data: e.data ? (scrub(e.data) as Record<string, unknown>) : null,
  });
}
