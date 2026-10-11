import { platformAdminRoute } from "@/server/admin-http";
import { getAccountDetail } from "@/server/services/admin/accounts";

export const GET = platformAdminRoute(async (_req, _admin, p) => getAccountDetail(p.id!));
