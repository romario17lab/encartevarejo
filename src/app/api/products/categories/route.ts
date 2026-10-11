import { tenantRoute } from "@/server/http";
import { listCategories } from "@/server/services/products";

export const GET = tenantRoute(async (_req, ctx) => ({ categories: await listCategories(ctx) }));
