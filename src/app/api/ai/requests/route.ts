import { tenantRoute } from "@/server/http";
import { qp } from "@/server/route-helpers";
import { aiStatus, listAiRequests } from "@/server/ai/requests";

/** Histórico de pedidos à IA da conta + créditos do mês. */
export const GET = tenantRoute(async (req, ctx) => {
  const limit = Number(qp(req, "limit") ?? 50);
  const [status, requests] = await Promise.all([aiStatus(ctx), listAiRequests(ctx, Number.isFinite(limit) ? limit : 50)]);
  return { ...status, requests };
}, { permission: "products.read" });
