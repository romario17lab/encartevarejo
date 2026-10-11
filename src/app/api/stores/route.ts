import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createStore, listStores } from "@/server/services/stores";

export const GET = tenantRoute(async (_req, ctx) => ({ stores: await listStores(ctx) }));
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createStore(ctx, await readJson(req)), { status: 201 }));
