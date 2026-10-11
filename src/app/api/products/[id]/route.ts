import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { archiveProduct, getProduct, updateProduct } from "@/server/services/products";

export const GET = tenantRoute(async (_req, ctx, p) => getProduct(ctx, p.id!));
export const PATCH = tenantRoute(async (req, ctx, p) => updateProduct(ctx, p.id!, await readJson(req)));
export const DELETE = tenantRoute(async (_req, ctx, p) => archiveProduct(ctx, p.id!));
