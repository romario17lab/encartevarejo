import { tenantRoute } from "@/server/http";
import { aiStatus } from "@/server/ai/requests";

export const GET = tenantRoute(async (_req, ctx) => aiStatus(ctx), { permission: "products.read" });
