import { tenantRoute } from "@/server/http";
import { billingOverview } from "@/server/services/subscriptions";

export const dynamic = "force-dynamic";

/** GET /api/billing → plano, status da assinatura, consumo × limites, planos disponíveis e provedor configurado. */
export const GET = tenantRoute(async (_req, ctx) => billingOverview(ctx));
