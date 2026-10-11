import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteScreen, getScreenDetail, updateScreen } from "@/server/services/tv";

export const GET = tenantRoute(async (_req, ctx, p) => getScreenDetail(ctx, p.id!), { permission: "campaigns.read" });
export const PATCH = tenantRoute(async (req, ctx, p) => updateScreen(ctx, p.id!, await readJson(req)), { permission: "campaigns.write" });
export const DELETE = tenantRoute(async (_req, ctx, p) => deleteScreen(ctx, p.id!), { permission: "campaigns.write" });
