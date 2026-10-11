import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteImportProfile, updateImportProfile } from "@/server/services/import-profiles";

export const PATCH = tenantRoute(async (req, ctx, p) => updateImportProfile(ctx, p.id!, await readJson(req)));
export const DELETE = tenantRoute(async (_req, ctx, p) => deleteImportProfile(ctx, p.id!));
