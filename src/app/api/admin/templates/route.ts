import { platformAdminRoute } from "@/server/admin-http";
import { listTemplatesAdmin } from "@/server/services/admin/templates";

export const GET = platformAdminRoute(async () => listTemplatesAdmin());
