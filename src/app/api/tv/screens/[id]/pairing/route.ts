import { tenantRoute } from "@/server/http";
import { regeneratePairing } from "@/server/services/tv";

/** Gera um novo código de pareamento (15 minutos, uso único). */
export const POST = tenantRoute(async (_req, ctx, p) => regeneratePairing(ctx, p.id!), { permission: "campaigns.write" });
