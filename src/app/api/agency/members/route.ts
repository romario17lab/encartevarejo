import { tenantRoute } from "@/server/http";
import { listAgencyMembers } from "@/server/services/agency";

export const GET = tenantRoute(async (_req, ctx) => ({ members: await listAgencyMembers(ctx) }));
