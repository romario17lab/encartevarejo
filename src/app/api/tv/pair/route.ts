import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { pairDevice } from "@/server/services/tv";

/** Pareamento do aparelho pelo código (público, com limite de tentativas). Devolve o token do aparelho. */
export const POST = publicRoute(async (req) => {
  hitRateLimit(`tv-pair:${clientIp(req)}`, 10, 10 * 60_000);
  const body = (await readJson(req)) as { code?: unknown };
  const r = await pairDevice(body?.code);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
});
