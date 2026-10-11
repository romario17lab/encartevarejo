import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteOrg, getOrg, updateOrg } from "@/server/services/org";

export const GET = tenantRoute(async (_req, ctx) => getOrg(ctx));
export const PATCH = tenantRoute(async (req, ctx) => updateOrg(ctx, await readJson(req)));
export const DELETE = tenantRoute(async (req, ctx) => deleteOrg(ctx, await readJson(req)));
