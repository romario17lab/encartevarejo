import type { NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { getStorefront } from "@/server/services/storefront";

export const GET = publicRoute(async (_req: NextRequest, p) => {
  const sf = await getStorefront(p.slug ?? "");
  if (!sf) throw new AppError("not_found", "Loja não encontrada.");
  const { orgId: _o, ...store } = sf.store;
  return { ...sf, store };
});
