import { and, eq, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { writeAudit } from "../audit";

/**
 * Tarefa periódica (chamada pelo worker a cada minuto):
 * 1. publica campanhas "agendada" cujo horário chegou — apenas se continuam aprovadas na versão atual;
 *    caso contrário, voltam para rascunho (com registro na auditoria);
 * 2. encerra campanhas cuja validade (endsAt) terminou.
 * Idempotente e segura para execução concorrente: cada mudança é um UPDATE condicional atômico.
 */
export async function runCampaignScheduler(now: Date = new Date()): Promise<{ published: number; ended: number }> {
  const db = getDb();
  const c = schema.campaigns;

  const published = await db.update(c).set({
    status: "publicada", publishedVersion: sql`${c.version}`, publishedAt: now, scheduledPublishAt: null, updatedAt: now,
  }).where(and(
    eq(c.status, "agendada"), isNotNull(c.scheduledPublishAt), lte(c.scheduledPublishAt, now), isNull(c.deletedAt),
    isNotNull(c.approvedHash), eq(c.approvedHash, c.contentHash), or(isNull(c.endsAt), sql`${c.endsAt} > ${now}`),
  )).returning({ id: c.id, orgId: c.orgId, name: c.name, version: c.version });
  for (const r of published) {
    await writeAudit(db, { orgId: r.orgId, userId: null, action: "campaign.publish", entityType: "campaign", entityId: r.id, summary: `Campanha "${r.name}" publicada automaticamente no horário agendado (versão ${r.version}).` });
  }

  const reverted = await db.update(c).set({ status: "rascunho", scheduledPublishAt: null, approvedVersion: null, approvedHash: null, approvedBy: null, approvedAt: null, updatedAt: now })
    .where(and(
      eq(c.status, "agendada"), isNotNull(c.scheduledPublishAt), lte(c.scheduledPublishAt, now), isNull(c.deletedAt),
      or(isNull(c.approvedHash), sql`${c.approvedHash} is distinct from ${c.contentHash}`),
    )).returning({ id: c.id, orgId: c.orgId, name: c.name });
  for (const r of reverted) {
    await writeAudit(db, { orgId: r.orgId, userId: null, action: "campaign.schedule_cancelled", entityType: "campaign", entityId: r.id, summary: `Publicação agendada da campanha "${r.name}" não aconteceu: o conteúdo mudou depois da aprovação. Voltou para rascunho.` });
  }

  const ended = await db.update(c).set({ status: "encerrada", scheduledPublishAt: null, updatedAt: now })
    .where(and(
      isNotNull(c.endsAt), lt(c.endsAt, now), isNull(c.deletedAt), ne(c.status, "encerrada"),
      or(sql`${c.status} in ('publicada', 'agendada', 'aprovada')`, isNotNull(c.publishedVersion)),
    )).returning({ id: c.id, orgId: c.orgId, name: c.name });
  for (const r of ended) {
    await writeAudit(db, { orgId: r.orgId, userId: null, action: "campaign.end", entityType: "campaign", entityId: r.id, summary: `Campanha "${r.name}" encerrada automaticamente ao fim da validade.` });
  }

  const result = { published: published.length, ended: ended.length };
  if (published.length || ended.length || reverted.length) {
    await db.insert(schema.jobRuns).values({ name: "campaign_scheduler", result: { ...result, reverted: reverted.length, at: now.toISOString() } });
  }
  return result;
}
