import { tenantRoute } from "@/server/http";
import { findDuplicates } from "@/server/services/products";

export const GET = tenantRoute(async (_req, ctx) => findDuplicates(ctx));
