import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { duplicateCampaign } from "@/server/services/campaigns";

export const POST = tenantRoute(async (req, ctx, p) => NextResponse.json(await duplicateCampaign(ctx, p.id!, await readJson(req)), { status: 201 }));
