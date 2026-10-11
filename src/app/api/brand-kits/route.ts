import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createBrandKit, listBrandKits } from "@/server/services/brand-kits";

export const GET = tenantRoute(async (_req, ctx) => ({ brandKits: await listBrandKits(ctx) }));
export const POST = tenantRoute(async (req, ctx) => createBrandKit(ctx, await readJson(req)));
