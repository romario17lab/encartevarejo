import { tenantRoute } from "@/server/http";
import { deleteStorePrice } from "@/server/services/products";

export const DELETE = tenantRoute(async (_req, ctx, p) => deleteStorePrice(ctx, p.id!, p.productId!));
