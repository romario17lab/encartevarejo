import { tenantRoute } from "@/server/http";
import { listExportJobs } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

/** GET /api/exports?campaignId= */
export const GET = tenantRoute(async (req, ctx) => ({ exports: await listExportJobs(ctx, req.nextUrl.searchParams.get("campaignId")) }), { permission: "campaigns.read" });
