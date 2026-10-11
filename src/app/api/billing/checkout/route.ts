import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { startCheckout } from "@/server/services/subscriptions";

/** POST /api/billing/checkout { planId } → { url } do checkout do provedor (modo de testes). */
export const POST = tenantRoute(async (req, ctx) => startCheckout(ctx, await readJson(req)), { permission: "billing.manage" });
