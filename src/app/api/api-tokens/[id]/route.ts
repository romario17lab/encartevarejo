import { tenantRoute } from "@/server/http";
import { revokeApiToken } from "@/server/services/api-tokens";

export const DELETE = tenantRoute(async (_req, ctx, p) => revokeApiToken(ctx, p.id!), { permission: "org.manage" });
