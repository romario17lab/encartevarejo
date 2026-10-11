import { z } from "zod";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { removeBackground } from "@/server/services/ai-background";

export const maxDuration = 90;

/** Cria uma versão sem fundo (arquivo novo); a original não é alterada. */
export const POST = tenantRoute(async (req, ctx) => {
  const { assetId } = z.object({ assetId: z.string().min(1).max(60) }).parse(await readJson(req));
  return removeBackground(ctx, assetId);
}, { permission: "products.write" });
