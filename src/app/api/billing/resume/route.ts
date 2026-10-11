import { tenantRoute } from "@/server/http";
import { resumeSubscription } from "@/server/services/subscriptions";

/** POST /api/billing/resume → desfaz o cancelamento agendado. */
export const POST = tenantRoute(async (_req, ctx) => resumeSubscription(ctx), { permission: "billing.manage" });
