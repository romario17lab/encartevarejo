import { NextResponse } from "next/server";
import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { createPlan, listPlansAdmin } from "@/server/services/admin/plans";

export const GET = platformAdminRoute(async () => listPlansAdmin());
export const POST = platformAdminRoute(async (req, admin) => NextResponse.json({ plan: await createPlan(admin.userId, await readJson(req)) }, { status: 201 }));
