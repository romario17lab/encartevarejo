import { tenantRoute } from "@/server/http";
import { resendInvitation } from "@/server/services/members";

export const POST = tenantRoute(async (_req, ctx, p) => resendInvitation(ctx, p.id!));
