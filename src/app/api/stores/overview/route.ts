import { tenantRoute } from "@/server/http";
import { storesOverview } from "@/server/services/stores";

export const GET = tenantRoute(async (_req, ctx) => storesOverview(ctx));
