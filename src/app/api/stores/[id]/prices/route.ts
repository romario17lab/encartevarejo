import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { listStorePrices, upsertStorePrices } from "@/server/services/products";

export const GET = tenantRoute(async (_req, ctx, p) => ({ prices: await listStorePrices(ctx, p.id!) }));
export const PUT = tenantRoute(async (req, ctx, p) => ({ prices: await upsertStorePrices(ctx, p.id!, await readJson(req)) }));
