import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { transitionCampaign } from "@/server/services/campaign-workflow";

export const POST = tenantRoute(async (req, ctx, p) => transitionCampaign(ctx, p.id!, "reject", await readJson(req)));
