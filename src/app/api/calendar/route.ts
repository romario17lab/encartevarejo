import { tenantRoute } from "@/server/http";
import { qp } from "@/server/route-helpers";
import { listCalendar } from "@/server/services/org";

export const GET = tenantRoute(async (req, ctx) => ({ events: await listCalendar(ctx, qp(req, "from"), qp(req, "to")) }));
