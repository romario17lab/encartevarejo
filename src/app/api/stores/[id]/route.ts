import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteStore, getStore, updateStore } from "@/server/services/stores";

export const GET = tenantRoute(async (_req, ctx, p) => getStore(ctx, p.id!));
export const PATCH = tenantRoute(async (req, ctx, p) => updateStore(ctx, p.id!, await readJson(req)));
export const DELETE = tenantRoute(async (_req, ctx, p) => deleteStore(ctx, p.id!));
