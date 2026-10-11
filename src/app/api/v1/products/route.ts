import { apiTokenRoute } from "@/server/api-token-http";
import { apiListProducts } from "@/server/services/api-tokens";

export const GET = apiTokenRoute(async (req, api) => {
  const sp = req.nextUrl.searchParams;
  return apiListProducts(api, { barcode: sp.get("barcode"), q: sp.get("q"), updatedSince: sp.get("updatedSince"), storeId: sp.get("storeId"), cursor: sp.get("cursor"), limit: sp.get("limit") });
}, { scope: "products.read" });
