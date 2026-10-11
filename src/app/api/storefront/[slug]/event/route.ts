import type { NextRequest } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { recordStorefrontEvent } from "@/server/services/storefront";

// Eventos públicos da vitrine: clique no WhatsApp e compartilhamento. Sem dados pessoais.
const bodySchema = z.object({
  kind: z.enum(["whatsapp_click", "share"]),
  source: z.string().max(100).nullable().optional(),
  campaignId: z.string().max(64).nullable().optional(),
});

export const POST = publicRoute(async (req: NextRequest, p) => {
  const slug = p.slug ?? "";
  const body = bodySchema.parse(await req.json().catch(() => { throw new AppError("validation", "Envie um JSON válido."); }));
  hitRateLimit(`sf-event:${clientIp(req)}:${slug}`, 60, 10 * 60 * 1000);
  const ok = await recordStorefrontEvent(slug, body.kind, { source: body.source ?? null, campaignId: body.campaignId ?? null });
  if (!ok) throw new AppError("not_found", "Loja não encontrada.");
  return { ok: true };
});
