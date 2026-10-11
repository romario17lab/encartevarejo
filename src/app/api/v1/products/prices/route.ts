import { apiTokenRoute } from "@/server/api-token-http";
import { readJson } from "@/server/route-helpers";
import { apiUpsertPrices } from "@/server/services/api-tokens";

export const PUT = apiTokenRoute(async (req, api) => apiUpsertPrices(api, await readJson(req)), { scope: "prices.write" });
