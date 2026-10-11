import { tenantRoute } from "@/server/http";
import { retryVideoJob } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** POST /api/videos/:id/retry → volta para a fila um vídeo que falhou */
export const POST = tenantRoute(async (_req, ctx, params) => retryVideoJob(ctx, params.id), { permission: "exports.create" });
