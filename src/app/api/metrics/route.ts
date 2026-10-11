import { tenantRoute } from "@/server/http";
import { getMetrics } from "@/server/services/metrics";

// GET /api/metrics?periodo=7|30|90&loja=<storeId opcional> — métricas da conta ativa (qualquer membro).
export const GET = tenantRoute(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  return getMetrics(ctx, { periodo: sp.get("periodo") ?? undefined, loja: sp.get("loja") || undefined });
}, { permission: "campaigns.read" });
