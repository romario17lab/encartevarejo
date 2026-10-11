import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { readJson } from "@/server/route-helpers";
import { resolveSession } from "@/server/auth/session";
import { setActiveOrg } from "@/server/services/auth";

export const POST = publicRoute(async (req: NextRequest) => {
  const s = await resolveSession(req);
  if (!s) throw new AppError("unauthenticated", "Faça login para continuar.");
  return setActiveOrg(s.user, s.sessionId, await readJson(req));
});
