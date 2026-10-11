import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { updatePlan } from "@/server/services/admin/plans";

export const PATCH = platformAdminRoute(async (req, admin, p) => ({ plan: await updatePlan(admin.userId, p.id!, await readJson(req)) }));
