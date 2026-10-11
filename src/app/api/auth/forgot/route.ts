import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { forgotPassword } from "@/server/services/auth";
import { clientIp } from "@/server/auth/rate-limit";

export const POST = publicRoute(async (req: NextRequest) => forgotPassword(await readJson(req), { ip: clientIp(req) }));
