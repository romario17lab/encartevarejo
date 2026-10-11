import { tenantRoute } from "@/server/http";
import { organizeCampaign } from "@/server/services/ai-organize";
import { aiRateLimit } from "@/server/ai/requests";

export const maxDuration = 120;

/** Sugestões de destaques, categorias e ordem (o usuário aceita cada mudança no editor). */
export const POST = tenantRoute(async (_req, ctx, { id }) => {
  aiRateLimit(ctx);
  return organizeCampaign(ctx, id!);
}, { permission: "campaigns.write" });
