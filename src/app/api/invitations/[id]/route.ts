import { tenantRoute } from "@/server/http";
import { revokeInvitation } from "@/server/services/members";

export const DELETE = tenantRoute(async (_req, ctx, p) => revokeInvitation(ctx, p.id!));
