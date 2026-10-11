import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { qp, readJson } from "@/server/route-helpers";
import { createCalendarEvent, getCalendar } from "@/server/services/calendar-events";

/** GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD → { range, events, campaigns, canEdit } */
export const GET = tenantRoute(async (req, ctx) => getCalendar(ctx, qp(req, "from"), qp(req, "to")));

/** POST /api/calendar { name, date, note? } → evento da conta */
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createCalendarEvent(ctx, await readJson(req)), { status: 201 }), { permission: "campaigns.write" });
