import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { removeMember, updateMember } from "@/server/services/members";

export const PATCH = tenantRoute(async (req, ctx, p) => updateMember(ctx, p.userId!, await readJson(req)));
export const DELETE = tenantRoute(async (_req, ctx, p) => removeMember(ctx, p.userId!));
