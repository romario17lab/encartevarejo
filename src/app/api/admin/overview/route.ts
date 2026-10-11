import { platformAdminRoute } from "@/server/admin-http";
import { adminOverview } from "@/server/services/admin/monitoring";

export const GET = platformAdminRoute(async () => adminOverview());
