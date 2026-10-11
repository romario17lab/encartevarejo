import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { changeAccountPlan } from "@/server/services/admin/accounts";

export const POST = platformAdminRoute(async (req, admin, p) => changeAccountPlan(admin.userId, p.id!, await readJson(req)));
