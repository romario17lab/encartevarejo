import { tenantRoute } from "@/server/http";
import { videoConfig } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** GET /api/videos/config → minutos do plano (usados/restantes) e se a narração está configurada */
export const GET = tenantRoute(async (_req, ctx) => videoConfig(ctx), { permission: "campaigns.read" });
