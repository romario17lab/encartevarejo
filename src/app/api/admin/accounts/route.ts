import { platformAdminRoute } from "@/server/admin-http";
import { listAccounts } from "@/server/services/admin/accounts";

export const GET = platformAdminRoute(async (req) => listAccounts(Object.fromEntries(req.nextUrl.searchParams)));
