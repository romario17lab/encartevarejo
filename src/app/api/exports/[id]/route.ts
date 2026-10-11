import { tenantRoute } from "@/server/http";
import { getExportJob } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

/** GET /api/exports/:id */
export const GET = tenantRoute(async (_req, ctx, params) => getExportJob(ctx, params.id), { permission: "campaigns.read" });
