import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { signup } from "@/server/services/auth";
import { setSessionCookie } from "@/server/auth/session";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

export const POST = publicRoute(async (req: NextRequest) => {
  hitRateLimit(`signup:${clientIp(req)}`, 20, 60 * 60 * 1000);
  const r = await signup(await readJson(req), { userAgent: req.headers.get("user-agent") });
  return setSessionCookie(NextResponse.json({ ok: true, userId: r.userId, orgId: r.orgId, storeId: r.storeId }, { status: 201 }), r.token);
});
