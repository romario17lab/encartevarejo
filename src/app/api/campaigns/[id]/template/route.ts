import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { switchTemplate } from "@/server/services/campaigns";

export const POST = tenantRoute(async (req, ctx, p) => switchTemplate(ctx, p.id!, await readJson(req)));
