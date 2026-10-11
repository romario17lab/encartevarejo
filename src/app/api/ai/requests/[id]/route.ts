import { z } from "zod";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { requirePermission } from "@/server/tenant";
import { getAiRequest, markAiRequest } from "@/server/ai/requests";

/** Marca o resultado de um pedido como revisado (aceito) ou descartado. */
export const POST = tenantRoute(async (req, ctx, { id }) => {
  const { status } = z.object({ status: z.enum(["revisada", "descartada"]) }).parse(await readJson(req));
  const r = await getAiRequest(ctx, id!);
  requirePermission(ctx, r.kind === "extrair_lista" || r.kind === "remover_fundo" ? "products.write" : "campaigns.write");
  return markAiRequest(ctx, id!, status);
}, { permission: "products.read" });
