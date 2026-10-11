import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { suggestCampaignIdeas } from "@/server/services/ai-campaigns";

export const maxDuration = 120;

/** Ideias de campanha a partir do calendário e do catálogo (sem preços). */
export const POST = tenantRoute(async (req, ctx) => suggestCampaignIdeas(ctx, await readJson(req)), { permission: "campaigns.write" });
