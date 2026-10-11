import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { PIN_COOKIE_MAX_AGE, PREVIEW_PIN_COOKIE, verifyPreviewPin } from "@/server/services/preview-links";

// Página pública de aprovação: confere o PIN do link e grava um cookie assinado (só para este link).
export const POST = publicRoute(async (req, p) => {
  hitRateLimit(`pv-pin:${clientIp(req)}`, 30, 15 * 60 * 1000);
  const r = await verifyPreviewPin(p.token ?? "", await readJson(req));
  const res = NextResponse.json({ ok: true });
  if (r.cookie) {
    res.cookies.set(PREVIEW_PIN_COOKIE(r.linkId), r.cookie, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: PIN_COOKIE_MAX_AGE, secure: (process.env.APP_URL ?? "").startsWith("https://"),
    });
  }
  res.headers.set("cache-control", "no-store");
  return res;
});
