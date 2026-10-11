import { tenantRoute } from "@/server/http";
import { previewScreen } from "@/server/services/tv";

/** O que a tela toca agora (mesma montagem enviada ao aparelho). */
export const GET = tenantRoute(async (_req, ctx, p) => previewScreen(ctx, p.id!), { permission: "campaigns.read" });
