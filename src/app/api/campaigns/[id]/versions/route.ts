import { tenantRoute } from "@/server/http";
import { listVersions } from "@/server/services/campaigns";

export const GET = tenantRoute(async (_req, ctx, p) => ({ versions: await listVersions(ctx, p.id!) }));
