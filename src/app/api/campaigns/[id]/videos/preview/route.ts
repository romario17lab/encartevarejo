import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { previewVideo } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** POST /api/campaigns/:id/videos/preview { orientation, style, duration } → { url, plan, narration } (nada é gravado) */
export const POST = tenantRoute(async (req, ctx, params) => previewVideo(ctx, params.id, await readJson(req)), { permission: "exports.create" });
