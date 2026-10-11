import { platformAdminRoute } from "@/server/admin-http";
import { listBillingEvents } from "@/server/services/admin/monitoring";

export const GET = platformAdminRoute(async (req) => listBillingEvents(Object.fromEntries(req.nextUrl.searchParams)));
