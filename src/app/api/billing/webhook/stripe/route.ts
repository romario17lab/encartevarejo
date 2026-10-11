import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { WebhookSignatureError } from "@/server/billing";
import { handleWebhook } from "@/server/services/subscriptions";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook/stripe — público, corpo BRUTO (necessário para validar a assinatura).
 * 400 = assinatura ausente/inválida/expirada (o Stripe reenvia); 200 = recebido (inclusive duplicado ou ignorado).
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 512 * 1024) return NextResponse.json({ error: { code: "validation", message: "Evento grande demais." } }, { status: 413 });
    const r = await handleWebhook("stripe", raw, req.headers);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof WebhookSignatureError) {
      return NextResponse.json({ error: { code: "invalid_signature", message: "Assinatura do evento inválida." } }, { status: 400 });
    }
    return jsonError(e);
  }
}
