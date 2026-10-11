import { tenantRoute } from "@/server/http";
import { listMembers } from "@/server/services/members";

export const GET = tenantRoute(async (_req, ctx) => ({ members: await listMembers(ctx) }));
