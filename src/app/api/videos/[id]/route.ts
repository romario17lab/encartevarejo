import { tenantRoute } from "@/server/http";
import { cancelVideoJob, getVideoJob } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** GET /api/videos/:id → status, progresso, erro e link de download */
export const GET = tenantRoute(async (_req, ctx, params) => getVideoJob(ctx, params.id), { permission: "campaigns.read" });

/** DELETE /api/videos/:id → cancela (na fila / gerando) ou exclui (pronto / com falha) */
export const DELETE = tenantRoute(async (_req, ctx, params) => cancelVideoJob(ctx, params.id), { permission: "exports.create" });
