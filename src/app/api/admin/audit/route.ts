import { platformAdminRoute } from "@/server/admin-http";
import { listAdminAudit } from "@/server/services/admin/audit";

export const GET = platformAdminRoute(async (req) => listAdminAudit(Object.fromEntries(req.nextUrl.searchParams)));
