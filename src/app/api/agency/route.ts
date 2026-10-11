import { tenantRoute } from "@/server/http";
import { agencyStatus } from "@/server/services/agency";

export const GET = tenantRoute(async (_req, ctx) => agencyStatus(ctx));
