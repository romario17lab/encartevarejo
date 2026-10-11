import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { login } from "@/server/services/auth";
import { setSessionCookie } from "@/server/auth/session";
import { clientIp } from "@/server/auth/rate-limit";

export const POST = publicRoute(async (req: NextRequest) => {
  const r = await login(await readJson(req), { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return setSessionCookie(NextResponse.json({ ok: true, userId: r.userId, orgId: r.orgId }), r.token);
});
