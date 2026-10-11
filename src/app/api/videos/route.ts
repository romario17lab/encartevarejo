import { tenantRoute } from "@/server/http";
import { listVideoJobs } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** GET /api/videos?campaignId= */
export const GET = tenantRoute(async (req, ctx) => ({ videos: await listVideoJobs(ctx, req.nextUrl.searchParams.get("campaignId")) }), { permission: "campaigns.read" });
