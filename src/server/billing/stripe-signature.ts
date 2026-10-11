// Verificação da assinatura de webhooks do Stripe (cabeçalho Stripe-Signature), sem SDK.
// Formato: "t=<unix>,v1=<hex>[,v1=<hex>...]" onde v1 = HMAC-SHA256(segredo, `${t}.${corpoBruto}`).
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TOLERANCE_SEC = 300;

export type SignatureResult = { ok: true; timestamp: number } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

export function computeStripeSignature(payload: string, secret: string, timestamp: number): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

/** Monta um cabeçalho Stripe-Signature (usado pelos testes com eventos assinados localmente). */
export function stripeSignatureHeader(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${computeStripeSignature(payload, secret, timestamp)}`;
}

export function verifyStripeSignature(payload: string, header: string | null | undefined, secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {}): SignatureResult {
  if (!header) return { ok: false, reason: "missing" };
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim();
    if (k === "t") t = /^\d+$/.test(v) ? Number(v) : null;
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) sigs.push(v.toLowerCase());
  }
  if (t === null || !sigs.length) return { ok: false, reason: "malformed" };
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const tol = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  if (Math.abs(now - t) > tol) return { ok: false, reason: "expired" };
  const expected = Buffer.from(computeStripeSignature(payload, secret, t), "hex");
  const match = sigs.some((s) => { const b = Buffer.from(s, "hex"); return b.length === expected.length && timingSafeEqual(b, expected); });
  return match ? { ok: true, timestamp: t } : { ok: false, reason: "mismatch" };
}
