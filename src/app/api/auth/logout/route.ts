import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { clearSessionCookie, deleteSession, resolveSession } from "@/server/auth/session";

export const POST = publicRoute(async (req: NextRequest) => {
  const s = await resolveSession(req);
  if (s) await deleteSession(s.sessionId);
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
