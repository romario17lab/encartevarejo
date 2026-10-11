import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { resolveSession } from "@/server/auth/session";
import { getMe } from "@/server/services/auth";

export const GET = publicRoute(async (req: NextRequest) => {
  const s = await resolveSession(req);
  if (!s) throw new AppError("unauthenticated", "Faça login para continuar.");
  return getMe(s.user, s.activeOrgId);
});
