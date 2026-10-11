import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createVideoJob, listVideoJobs } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** POST /api/campaigns/:id/videos { orientation, style, duration, audio, narration } → pedido na fila (versão atual) */
export const POST = tenantRoute(async (req, ctx, params) => {
  const job = await createVideoJob(ctx, params.id, await readJson(req));
  return Response.json(job, { status: 201 });
}, { permission: "exports.create" });

/** GET /api/campaigns/:id/videos → vídeos desta campanha (status e progresso) */
export const GET = tenantRoute(async (_req, ctx, params) => ({ videos: await listVideoJobs(ctx, params.id) }), { permission: "campaigns.read" });
