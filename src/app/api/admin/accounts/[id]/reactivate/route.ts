import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { reactivateAccount } from "@/server/services/admin/accounts";

export const POST = platformAdminRoute(async (req, admin, p) => reactivateAccount(admin.userId, p.id!, await readJson(req)));
