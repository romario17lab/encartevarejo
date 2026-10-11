import { tenantRoute } from "@/server/http";
import { cancelSubscription } from "@/server/services/subscriptions";

/** POST /api/billing/cancel → agenda o cancelamento para o fim do período pago. */
export const POST = tenantRoute(async (_req, ctx) => cancelSubscription(ctx), { permission: "billing.manage" });
