import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { qp, readJson } from "@/server/route-helpers";
import { createCampaign, listCampaigns } from "@/server/services/campaigns";

export const GET = tenantRoute(async (req, ctx) => ({
  campaigns: await listCampaigns(ctx, { status: qp(req, "status"), storeId: qp(req, "storeId"), from: qp(req, "from"), to: qp(req, "to"), q: qp(req, "q") }),
}));
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createCampaign(ctx, await readJson(req)), { status: 201 }));
