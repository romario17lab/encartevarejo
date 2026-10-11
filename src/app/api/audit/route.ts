import { tenantRoute } from "@/server/http";
import { qp } from "@/server/route-helpers";
import { listHistory } from "@/server/services/history";

/** GET /api/audit?tipo=&loja=&entityType=&entityId=&cursor=&limit= */
export const GET = tenantRoute(async (req, ctx) => listHistory(ctx, {
  type: qp(req, "tipo") ?? qp(req, "type"), storeId: qp(req, "loja") ?? qp(req, "storeId"),
  entityType: qp(req, "entityType"), entityId: qp(req, "entityId"), cursor: qp(req, "cursor"), limit: Number(qp(req, "limit") ?? 50) || 50,
}));
