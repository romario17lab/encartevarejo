import { tenantRoute } from "@/server/http";
import { createScreenLink } from "@/server/services/tv";

/** Gera o link secreto do player (/tv/l/<token>), mostrado uma única vez. */
export const POST = tenantRoute(async (_req, ctx, p) => createScreenLink(ctx, p.id!), { permission: "campaigns.write" });
