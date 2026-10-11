import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createScreen, listScreens } from "@/server/services/tv";

export const GET = tenantRoute(async (_req, ctx) => listScreens(ctx), { permission: "campaigns.read" });
export const POST = tenantRoute(async (req, ctx) => ({ screen: await createScreen(ctx, await readJson(req)) }), { permission: "campaigns.write" });
