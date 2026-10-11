import { platformAdminRoute } from "@/server/admin-http";
import { retryExport } from "@/server/services/admin/monitoring";

export const POST = platformAdminRoute(async (_req, admin, p) => retryExport(admin.userId, p.id!));
