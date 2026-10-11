import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createClientAccount, listClients } from "@/server/services/agency";

export const GET = tenantRoute(async (_req, ctx) => listClients(ctx));
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createClientAccount(ctx, await readJson(req)), { status: 201 }));
