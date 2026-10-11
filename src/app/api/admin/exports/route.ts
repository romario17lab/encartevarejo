import { platformAdminRoute } from "@/server/admin-http";
import { listFailedExports } from "@/server/services/admin/monitoring";

export const GET = platformAdminRoute(async (req) => listFailedExports(Object.fromEntries(req.nextUrl.searchParams)));
