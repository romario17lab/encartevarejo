import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { bulkPriceCommit } from "@/server/services/products";

export const POST = tenantRoute(async (req, ctx) => bulkPriceCommit(ctx, await readJson(req)));
