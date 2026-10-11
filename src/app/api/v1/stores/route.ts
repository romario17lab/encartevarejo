import { apiTokenRoute } from "@/server/api-token-http";
import { apiListStores } from "@/server/services/api-tokens";

export const GET = apiTokenRoute(async (_req, api) => apiListStores(api), { scope: "products.read" });
