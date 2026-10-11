import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createImportProfile, listImportProfiles } from "@/server/services/import-profiles";

export const GET = tenantRoute(async (_req, ctx) => listImportProfiles(ctx));
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createImportProfile(ctx, await readJson(req)), { status: 201 }));
