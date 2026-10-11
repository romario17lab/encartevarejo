import { tenantRoute } from "@/server/http";
import { openPortal } from "@/server/services/subscriptions";

/** POST /api/billing/portal → { url } do portal do cliente no provedor. */
export const POST = tenantRoute(async (_req, ctx) => openPortal(ctx), { permission: "billing.manage" });
