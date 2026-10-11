import { tenantRoute } from "@/server/http";
import { suggestTexts } from "@/server/services/ai-texts";

export const maxDuration = 120;

/** Sugestões de título, subtítulo, descrições e legenda (o usuário edita e aceita). */
export const POST = tenantRoute(async (_req, ctx, { id }) => suggestTexts(ctx, id!), { permission: "campaigns.write" });
