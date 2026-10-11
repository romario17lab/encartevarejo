// Serviço de pedidos de exportação (API). Isolado por conta: toda consulta filtra por ctx.orgId.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db";
import type { TenantCtx } from "@/server/context";
import { AppError, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import { canAccessStore } from "@/server/tenant";
import { writeAudit } from "@/server/audit";
import { FORMATS, type FormatId } from "@/domain/formats";
import { getTemplate } from "@/templates/registry";
import { loadRenderBundle } from "@/server/services/render-data";
import { assertUsage } from "@/server/services/plans";
import { defaultPackageItems, runExportJob, type ExportRequest } from "./run";

const FILE_LABEL = { png: "PNG", jpeg: "JPEG", pdf: "PDF" } as const;
export const EXPORT_STATUS_LABEL = { na_fila: "Na fila", processando: "Gerando arquivos", concluida: "Pronta", falhou: "Falhou" } as const;

export const exportRequestSchema = z.object({
  kind: z.enum(["single", "package"]).default("single"),
  items: z.array(z.object({ format: z.string(), fileType: z.enum(["png", "jpeg", "pdf"]) })).max(30).default([]),
  bleed: z.boolean().optional(),
});

type JobRow = typeof schema.exportJobs.$inferSelect;

export function exportJobDto(job: JobRow, fileName?: string | null) {
  return {
    id: job.id,
    campaignId: job.campaignId,
    campaignVersion: job.campaignVersion,
    request: job.request,
    status: job.status,
    statusLabel: EXPORT_STATUS_LABEL[job.status],
    attempts: job.attempts,
    error: job.error,
    resultInfo: job.resultInfo ?? null,
    warnings: job.warnings ?? [],
    fileName: fileName ?? null,
    downloadUrl: job.status === "concluida" && job.resultAssetId ? `/api/exports/${job.id}/download` : null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}
export type ExportJobDto = ReturnType<typeof exportJobDto>;

async function fileNameOf(job: JobRow): Promise<string | null> {
  if (!job.resultAssetId) return null;
  const [a] = await getDb().select({ name: schema.assets.originalName }).from(schema.assets)
    .where(and(eq(schema.assets.id, job.resultAssetId), eq(schema.assets.orgId, job.orgId)));
  return a?.name ?? null;
}

/** Limite de exportações por mês do plano (contagem de pedidos no mês, horário de Brasília). */
async function assertMonthlyLimit(orgId: string) {
  await assertUsage(orgId, "exports", 1);
}

/** Cria o pedido fixado na versão ATUAL da campanha e enfileira (ou executa em processo com EXPORT_INLINE=1). */
export async function createExportJob(ctx: TenantCtx, campaignId: string, body: unknown): Promise<ExportJobDto> {
  const input = exportRequestSchema.parse(body ?? {});
  const bundle = await loadRenderBundle({ orgId: ctx.orgId }, campaignId, { version: "current", signedUrlTtlSec: 60 });
  if (!canAccessStore(ctx, bundle.storeId)) throw new AppError("forbidden", "Você não tem acesso a esta loja.");

  const items = input.items.length ? input.items : input.kind === "package" ? defaultPackageItems(bundle.pieces) : [];
  if (!items.length) throw new AppError("validation", "Escolha ao menos um formato para exportar.");
  for (const it of items) {
    const f = FORMATS[it.format as FormatId];
    if (!f) throw new AppError("validation", `Formato desconhecido: ${it.format}.`);
    if (!f.fileTypes.includes(it.fileType))
      throw new AppError("validation", `${f.label} não pode ser exportado como ${FILE_LABEL[it.fileType]}. Opções: ${f.fileTypes.map((t) => FILE_LABEL[t]).join(", ")}.`);
  }
  const unique = [...new Map(items.map((i) => [`${i.format}|${i.fileType}`, i])).values()];

  const errors = bundle.issues.filter((i) => i.level === "error");
  if (errors.length) {
    const list = errors.map((e) => `“${e.name}”: ${e.message}`);
    throw new AppError("validation", `Não é possível exportar enquanto houver erros nas ofertas. Corrija: ${list.slice(0, 6).join(" · ")}${list.length > 6 ? ` · e mais ${list.length - 6}` : ""}`, { issues: errors });
  }
  if (!getTemplate(bundle.templateId, bundle.templateVersion))
    throw new AppError("validation", "O modelo desta campanha não está disponível. Escolha outro modelo antes de exportar.");
  await assertMonthlyLimit(ctx.orgId);

  const request: ExportRequest = { kind: input.kind, items: unique, ...(input.bleed ? { bleed: true } : {}) };
  const db = getDb();
  const id = newId("exp");
  const [job] = await db.insert(schema.exportJobs).values({
    id, orgId: ctx.orgId, campaignId, campaignVersion: bundle.version, request, status: "na_fila", createdBy: ctx.userId,
  }).returning();
  await writeAudit(db, {
    orgId: ctx.orgId, userId: ctx.userId, action: "export.create", entityType: "campaign", entityId: campaignId,
    summary: `Exportação solicitada (versão ${bundle.version}): ${unique.map((i) => `${FORMATS[i.format as FormatId].label} ${FILE_LABEL[i.fileType]}`).join(", ")}`,
    data: { exportJobId: id, version: bundle.version, request },
  });

  if (process.env.EXPORT_INLINE === "1") {
    await runExportJob(id, { finalAttempt: true });
  } else {
    try {
      const { enqueueExport } = await import("@/worker/queue");
      await enqueueExport(id);
    } catch (e) {
      console.error("[export] falha ao enfileirar:", (e as Error).message);
      await db.update(schema.exportJobs).set({ status: "falhou", error: "Não foi possível colocar a exportação na fila. Tente novamente.", finishedAt: new Date() })
        .where(and(eq(schema.exportJobs.id, id), eq(schema.exportJobs.orgId, ctx.orgId)));
    }
  }
  return getExportJob(ctx, job!.id);
}

export async function getExportJobRow(ctx: Pick<TenantCtx, "orgId">, id: string): Promise<JobRow> {
  const [job] = await getDb().select().from(schema.exportJobs).where(and(eq(schema.exportJobs.id, id), eq(schema.exportJobs.orgId, ctx.orgId)));
  if (!job) throw notFound("Exportação");
  return job;
}

export async function getExportJob(ctx: Pick<TenantCtx, "orgId">, id: string): Promise<ExportJobDto> {
  const job = await getExportJobRow(ctx, id);
  return exportJobDto(job, await fileNameOf(job));
}

export async function listExportJobs(ctx: Pick<TenantCtx, "orgId">, campaignId?: string | null): Promise<ExportJobDto[]> {
  const where = campaignId
    ? and(eq(schema.exportJobs.orgId, ctx.orgId), eq(schema.exportJobs.campaignId, campaignId))
    : eq(schema.exportJobs.orgId, ctx.orgId);
  const rows = await getDb().select({ job: schema.exportJobs, fileName: schema.assets.originalName }).from(schema.exportJobs)
    .leftJoin(schema.assets, and(eq(schema.assets.id, schema.exportJobs.resultAssetId), eq(schema.assets.orgId, schema.exportJobs.orgId)))
    .where(where).orderBy(desc(schema.exportJobs.createdAt)).limit(50);
  return rows.map((r) => exportJobDto(r.job, r.fileName));
}

/** Arquivo pronto para download (mesma conta). */
export async function getExportDownload(ctx: Pick<TenantCtx, "orgId">, id: string) {
  const job = await getExportJobRow(ctx, id);
  if (job.status !== "concluida" || !job.resultAssetId) throw new AppError("conflict", "Os arquivos desta exportação ainda não estão prontos.");
  const [asset] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, job.resultAssetId), eq(schema.assets.orgId, ctx.orgId)));
  if (!asset) throw notFound("Arquivo da exportação");
  return { asset, fileName: asset.originalName ?? `exportacao-${job.id}` };
}
