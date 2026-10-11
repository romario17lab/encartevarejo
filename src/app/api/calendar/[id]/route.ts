import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteCalendarEvent, updateCalendarEvent } from "@/server/services/calendar-events";

/** PATCH /api/calendar/:id { name?, date?, note? } — só eventos da conta */
export const PATCH = tenantRoute(async (req, ctx, p) => updateCalendarEvent(ctx, p.id, await readJson(req)), { permission: "campaigns.write" });

/** DELETE /api/calendar/:id — só eventos da conta */
export const DELETE = tenantRoute(async (_req, ctx, p) => deleteCalendarEvent(ctx, p.id), { permission: "campaigns.write" });
