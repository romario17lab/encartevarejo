import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { resetPassword } from "@/server/services/auth";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";

export const POST = publicRoute(async (req: NextRequest) => {
  hitRateLimit(`reset:${clientIp(req)}`, 20, 15 * 60 * 1000);
  return resetPassword(await readJson(req));
});
