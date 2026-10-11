import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { API_SCOPE_LABEL, createApiToken, listApiTokens } from "@/server/services/api-tokens";

export const GET = tenantRoute(async (_req, ctx) => ({ tokens: await listApiTokens(ctx), scopes: API_SCOPE_LABEL }), { permission: "org.manage" });
export const POST = tenantRoute(async (req, ctx) => {
  const res = NextResponse.json(await createApiToken(ctx, await readJson(req)), { status: 201 });
  res.headers.set("cache-control", "no-store");
  return res;
}, { permission: "org.manage" });
