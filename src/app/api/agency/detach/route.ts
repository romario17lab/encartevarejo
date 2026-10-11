import { tenantRoute } from "@/server/http";
import { detachClient } from "@/server/services/agency";

/** O administrador do cliente desliga a própria conta da agência. */
export const POST = tenantRoute(async (_req, ctx) => detachClient(ctx, null));
