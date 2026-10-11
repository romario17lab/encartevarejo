import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { lookupInvitation } from "@/server/services/members";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

export const GET = publicRoute(async (req: NextRequest) => {
  hitRateLimit(`invite-lookup:${clientIp(req)}`, 60, 15 * 60 * 1000);
  return lookupInvitation(req.nextUrl.searchParams.get("token") ?? "");
});
