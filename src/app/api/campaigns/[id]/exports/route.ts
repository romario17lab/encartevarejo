import { tenantRoute } from "@/server/http";
import { createExportJob, listExportJobs } from "@/server/export/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/campaigns/:id/exports { kind, items:[{format,fileType}], bleed? } → pedido fixado na versão atual */
export const POST = tenantRoute(async (req, ctx, params) => {
  const body = await req.json().catch(() => ({}));
  const job = await createExportJob(ctx, params.id, body);
  return Response.json(job, { status: 201 });
}, { permission: "exports.create" });

/** GET /api/campaigns/:id/exports → pedidos desta campanha */
export const GET = tenantRoute(async (_req, ctx, params) => ({ exports: await listExportJobs(ctx, params.id) }), { permission: "campaigns.read" });
