import { platformAdminRoute } from "@/server/admin-http";
import { usageOverview } from "@/server/services/admin/monitoring";

export const GET = platformAdminRoute(async (req) => usageOverview(Object.fromEntries(req.nextUrl.searchParams)));
