import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { bulkPricePreview } from "@/server/services/products";

export const POST = tenantRoute(async (req, ctx) => bulkPricePreview(ctx, await readJson(req)));
