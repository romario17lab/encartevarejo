import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { updateBrandKit } from "@/server/services/brand-kits";

export const PATCH = tenantRoute(async (req, ctx, p) => updateBrandKit(ctx, p.id!, await readJson(req)));
