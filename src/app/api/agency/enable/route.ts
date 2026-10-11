import { tenantRoute } from "@/server/http";
import { enableAgencyMode } from "@/server/services/agency";

export const POST = tenantRoute(async (_req, ctx) => enableAgencyMode(ctx));
