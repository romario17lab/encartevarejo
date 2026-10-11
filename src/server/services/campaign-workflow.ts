import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { can, STATUS_LABEL, type Role } from "@/domain/campaign";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Tx } from "../db/tx";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { computeIssues, iso, loadCampaignParts, type CampaignRow } from "./campaign-state";
import { getCampaignRow, getEditorState } from "./campaigns";

// Fluxo: rascunho → em_revisao → aprovada → (agendada) → publicada → encerrada
// Todas as regras são verificadas aqui, no servidor, dentro de transação com a linha travada.

type Action = "submit" | "approve" | "reject" | "publish" | "schedule" | "unpublish" | "end";

async function lockCampaign(tx: Tx, ctx: TenantCtx, id: string) {
  return getCampaignRow(ctx, id, tx, { forUpdate: true });
}

async function blockingIssues(tx: Tx, ctx: TenantCtx, c: CampaignRow) {
  const { items } = await loadCampaignParts(tx, ctx.orgId, c.id);
  const issues = await computeIssues(tx, ctx.orgId, { startsAt: iso(c.startsAt), endsAt: iso(c.endsAt) }, items);
  return issues.filter((i) => i.level === "error");
}

function wrongState(c: CampaignRow, what: string): never {
  throw new AppError("conflict", `Não é possível ${what}: a campanha está "${STATUS_LABEL[c.status]}".`);
}

/** Aprovação pela mesma pessoa que fez a última alteração só é permitida se não houver outro aprovador na conta. */
async function assertNotSelfApproval(tx: Tx, ctx: TenantCtx, c: CampaignRow) {
  const lastEditor = c.updatedBy ?? c.createdBy;
  if (lastEditor !== ctx.userId) return;
  const [org] = await tx.select({ settings: schema.organizations.settings }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId));
  if (org?.settings?.requireApproval === false) return;
  const others = await tx.select({ role: schema.memberships.role }).from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, ctx.orgId), ne(schema.memberships.userId, ctx.userId), inArray(schema.memberships.role, ["admin", "aprovador"])));
  if (others.some((m) => can(m.role as Role, "campaigns.approve")))
    throw new AppError("forbidden", "Você fez a última alteração desta campanha. Outra pessoa com permissão de aprovação precisa aprovar.");
}

const schemas = {
  reject: z.object({ note: z.string().trim().min(3, "Explique o motivo da reprovação.").max(500) }),
  schedule: z.object({ at: z.string().min(1) }),
  approve: z.object({ note: z.string().trim().max(500).optional() }),
};

export async function transitionCampaign(ctx: TenantCtx, id: string, action: Action, raw: unknown = {}, now = new Date()) {
  const perm = action === "submit" ? "campaigns.submit" : action === "approve" || action === "reject" ? "campaigns.approve" : "campaigns.publish";
  requirePermission(ctx, perm);
  const db = getDb();
  await db.transaction(async (tx) => {
    const c = await lockCampaign(tx, ctx, id);
    const where = and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.orgId));
    const audit = (summary: string, data?: Record<string, unknown>) =>
      writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: `campaign.${action}`, entityType: "campaign", entityId: id, summary, data: { version: c.version, ...data } });
    const approvedAndCurrent = c.approvedHash !== null && c.approvedHash === c.contentHash;

    switch (action) {
      case "submit": {
        if (c.status !== "rascunho") wrongState(c, "enviar para revisão");
        const errs = await blockingIssues(tx, ctx, c);
        if (errs.length) throw new AppError("validation", `Corrija ${errs.length} problema(s) antes de enviar para revisão.`, { issues: errs });
        await tx.update(schema.campaigns).set({ status: "em_revisao", updatedAt: now }).where(where);
        await audit(`Campanha "${c.name}" enviada para revisão.`);
        break;
      }
      case "approve": {
        const { note } = schemas.approve.parse(raw ?? {});
        if (c.status !== "em_revisao" && c.status !== "rascunho") wrongState(c, "aprovar");
        const errs = await blockingIssues(tx, ctx, c);
        if (errs.length) throw new AppError("validation", `Há ${errs.length} problema(s) que impedem a aprovação.`, { issues: errs });
        await assertNotSelfApproval(tx, ctx, c);
        await tx.update(schema.campaigns).set({ status: "aprovada", approvedVersion: c.version, approvedHash: c.contentHash, approvedBy: ctx.userId, approvedAt: now, updatedAt: now }).where(where);
        await audit(`Campanha "${c.name}" aprovada (versão ${c.version}).`, { approvedHash: c.contentHash, note: note ?? null });
        break;
      }
      case "reject": {
        const { note } = schemas.reject.parse(raw ?? {});
        if (c.status !== "em_revisao") wrongState(c, "reprovar");
        await tx.update(schema.campaigns).set({ status: "rascunho", updatedAt: now }).where(where);
        await audit(`Campanha "${c.name}" devolvida para ajustes: ${note}`, { note });
        break;
      }
      case "publish": {
        if (!["aprovada", "agendada", "publicada"].includes(c.status) || !approvedAndCurrent)
          throw new AppError("conflict", "A campanha precisa estar aprovada (na versão atual) para ser publicada.");
        if (c.endsAt && c.endsAt < now) throw new AppError("validation", "A validade da campanha já terminou. Ajuste as datas e aprove novamente.");
        await tx.update(schema.campaigns).set({ status: "publicada", publishedVersion: c.version, publishedAt: now, scheduledPublishAt: null, updatedAt: now }).where(where);
        await audit(`Campanha "${c.name}" publicada na vitrine (versão ${c.version}).`);
        break;
      }
      case "schedule": {
        const { at } = schemas.schedule.parse(raw ?? {});
        const when = new Date(at);
        if (isNaN(+when)) throw new AppError("validation", "Data de agendamento inválida.");
        if (!["aprovada", "agendada"].includes(c.status) || !approvedAndCurrent) throw new AppError("conflict", "Só é possível agendar uma campanha aprovada.");
        if (when.getTime() < now.getTime() - 60_000) throw new AppError("validation", "Escolha uma data de publicação no futuro.");
        if (c.endsAt && when >= c.endsAt) throw new AppError("validation", "A publicação precisa acontecer antes do fim da validade.");
        await tx.update(schema.campaigns).set({ status: "agendada", scheduledPublishAt: when, updatedAt: now }).where(where);
        await audit(`Publicação da campanha "${c.name}" agendada para ${when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`, { at: when.toISOString() });
        break;
      }
      case "unpublish": {
        if (c.publishedVersion === null && c.status !== "agendada") throw new AppError("conflict", "A campanha não está na vitrine.");
        const status = c.status === "encerrada" ? "encerrada" : approvedAndCurrent ? "aprovada" : "rascunho";
        await tx.update(schema.campaigns).set({ status, publishedVersion: null, publishedAt: null, scheduledPublishAt: null, updatedAt: now }).where(where);
        await audit(c.publishedVersion !== null ? `Campanha "${c.name}" retirada da vitrine.` : `Agendamento da campanha "${c.name}" cancelado.`, { previousPublishedVersion: c.publishedVersion });
        break;
      }
      case "end": {
        if (c.status === "encerrada") wrongState(c, "encerrar");
        await tx.update(schema.campaigns).set({ status: "encerrada", scheduledPublishAt: null, updatedAt: now }).where(where);
        await audit(`Campanha "${c.name}" encerrada.`);
        break;
      }
    }
  });
  return getEditorState(ctx, id);
}

export const WORKFLOW_ACTIONS: Action[] = ["submit", "approve", "reject", "publish", "schedule", "unpublish", "end"];
export type WorkflowAction = Action;
