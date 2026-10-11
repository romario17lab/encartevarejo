import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { acceptInvitation } from "@/server/services/members";
import { resolveSession, setSessionCookie } from "@/server/auth/session";
import { getDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

export const POST = publicRoute(async (req: NextRequest) => {
  hitRateLimit(`invite-accept:${clientIp(req)}`, 20, 15 * 60 * 1000);
  const s = await resolveSession(req);
  const r = await acceptInvitation(await readJson(req), s?.user ?? null, { userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ ok: true, orgId: r.orgId });
  if (r.token) return setSessionCookie(res, r.token);
  if (s) await getDb().update(schema.sessions).set({ activeOrgId: r.orgId }).where(eq(schema.sessions.id, s.sessionId));
  return res;
});
