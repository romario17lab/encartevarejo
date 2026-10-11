import { tenantRoute } from "@/server/http";
import { detachClient } from "@/server/services/agency";

/** O administrador da agência desliga uma conta de cliente. */
export const POST = tenantRoute(async (_req, ctx, p) => detachClient(ctx, p.id));
