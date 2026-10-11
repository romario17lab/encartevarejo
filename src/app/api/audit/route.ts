import { tenantRoute } from "@/server/http";
import { qp } from "@/server/route-helpers";
import { listAudit } from "@/server/services/org";

export const GET = tenantRoute(async (req, ctx) => listAudit(ctx, {
  entityType: qp(req, "entityType"), entityId: qp(req, "entityId"), cursor: qp(req, "cursor"), limit: Number(qp(req, "limit") ?? 50) || 50,
}));
