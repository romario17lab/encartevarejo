import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { suspendAccount } from "@/server/services/admin/accounts";

export const POST = platformAdminRoute(async (req, admin, p) => suspendAccount(admin.userId, p.id!, await readJson(req)));
