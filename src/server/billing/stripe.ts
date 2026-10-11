// Provedor Stripe via API REST (fetch + application/x-www-form-urlencoded), sem SDK.
// Usado APENAS em modo de testes nesta etapa (ver config.ts). Nenhum segredo é registrado em log.
import { AppError } from "../errors";
import type { StripeConfig } from "./config";
import { verifyStripeSignature } from "./stripe-signature";
import {
  WebhookSignatureError, type BillingProvider, type CheckoutInput, type ProviderSubscription, type WebhookEvent, type WebhookKind,
} from "./types";

const API = "https://api.stripe.com/v1";
type Json = Record<string, unknown>;

/** Codifica objetos aninhados no formato do Stripe: a[b][0][c]=v */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  const walk = (v: unknown, key: string) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
    else if (typeof v === "object" && !(v instanceof Date)) for (const [k, x] of Object.entries(v as Json)) walk(x, key ? `${key}[${k}]` : k);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v instanceof Date ? Math.floor(v.getTime() / 1000) : String(v))}`);
  };
  walk(obj, prefix);
  return out.join("&");
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const idOf = (v: unknown): string | null => str(v) ?? (v && typeof v === "object" ? str((v as Json).id) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const date = (v: unknown): Date | null => { const n = num(v); return n ? new Date(n * 1000) : null; };
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const firstItem = (list: unknown): Json => obj((obj(list).data as unknown[] | undefined)?.[0]);

export function normalizeSubscription(s: Json): ProviderSubscription {
  const item = firstItem(s.items);
  return {
    id: str(s.id) ?? "",
    customerId: idOf(s.customer),
    rawStatus: str(s.status) ?? "unknown",
    priceId: idOf(item.price),
    // versões novas da API movem current_period_end para o item da assinatura
    currentPeriodEnd: date(s.current_period_end) ?? date(item.current_period_end),
    trialEnd: date(s.trial_end),
    cancelAtPeriodEnd: s.cancel_at_period_end === true,
    orgIdHint: str(obj(s.metadata).orgId),
  };
}

const KIND: Record<string, WebhookKind> = {
  "checkout.session.completed": "checkout_completed",
  "customer.subscription.created": "subscription_snapshot",
  "customer.subscription.updated": "subscription_snapshot",
  "customer.subscription.deleted": "subscription_deleted",
  "invoice.paid": "invoice_paid",
  "invoice.payment_failed": "invoice_payment_failed",
  "charge.refunded": "charge_refunded",
};

/** Converte o evento bruto do Stripe para o formato interno. Exportado para testes. */
export function normalizeStripeEvent(evt: Json): WebhookEvent {
  const type = str(evt.type) ?? "unknown";
  const o = obj(obj(evt.data).object);
  const kind = KIND[type] ?? "other";
  const base: WebhookEvent = {
    provider: "stripe", id: str(evt.id) ?? "", type, kind,
    createdAt: date(evt.created) ?? new Date(),
    testMode: evt.livemode !== true,
    orgIdHint: null, customerId: idOf(o.customer), subscriptionId: null,
    summary: { objectId: str(o.id), objectType: str(o.object) },
  };
  switch (kind) {
    case "checkout_completed": {
      const md = obj(o.metadata);
      base.orgIdHint = str(o.client_reference_id) ?? str(md.orgId);
      base.subscriptionId = idOf(o.subscription);
      base.planIdHint = str(md.planId);
      base.noPaymentRequired = o.payment_status === "no_payment_required";
      base.summary = { ...base.summary, mode: str(o.mode), paymentStatus: str(o.payment_status), planId: base.planIdHint };
      break;
    }
    case "subscription_snapshot":
    case "subscription_deleted": {
      const s = normalizeSubscription(o);
      base.subscription = s; base.subscriptionId = s.id || null; base.orgIdHint = s.orgIdHint;
      base.summary = { ...base.summary, status: s.rawStatus, priceId: s.priceId, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null };
      break;
    }
    case "invoice_paid":
    case "invoice_payment_failed": {
      const subDetails = obj(obj(o.parent).subscription_details);
      base.subscriptionId = idOf(o.subscription) ?? idOf(subDetails.subscription);
      base.orgIdHint = str(obj(subDetails.metadata).orgId) ?? str(obj(obj(o.subscription_details).metadata).orgId);
      const periodEnd = date(obj(firstItem(o.lines).period).end);
      base.invoice = { amountCents: num(kind === "invoice_paid" ? o.amount_paid : o.amount_due), periodEnd };
      base.summary = { ...base.summary, amountCents: base.invoice.amountCents, currency: str(o.currency), attempt: num(o.attempt_count), periodEnd: periodEnd?.toISOString() ?? null };
      break;
    }
    case "charge_refunded": {
      const amount = num(o.amount) ?? 0; const refunded = num(o.amount_refunded) ?? 0;
      base.refund = { amountCents: amount, refundedCents: refunded, full: o.refunded === true || (amount > 0 && refunded >= amount) };
      base.summary = { ...base.summary, amountCents: amount, refundedCents: refunded, full: base.refund.full, currency: str(o.currency) };
      break;
    }
    default: break;
  }
  return base;
}

export class StripeProvider implements BillingProvider {
  readonly name = "stripe" as const;
  readonly configured = true;
  readonly testMode: boolean;
  constructor(private readonly cfg: StripeConfig, private readonly fetchImpl: typeof fetch = fetch) { this.testMode = cfg.testMode; }

  private async call(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<Json> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.cfg.secretKey}` };
    if (params) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, { method, headers, body: params ? formEncode(params) : undefined, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new AppError("external_service", "Não foi possível falar com o serviço de pagamento. Tente novamente em instantes.");
    }
    const data = obj(await res.json().catch(() => ({})));
    if (!res.ok) {
      const err = obj(data.error);
      // registra só tipo/código (nunca a chave nem dados do cliente)
      console.error(`[billing] stripe ${method} ${path.split("/").slice(0, 2).join("/")} → ${res.status} ${str(err.type) ?? ""} ${str(err.code) ?? ""}`);
      throw new AppError("external_service", "O serviço de pagamento recusou a operação. Tente novamente ou fale com o suporte.");
    }
    return data;
  }

  async createCheckout(i: CheckoutInput) {
    const trialEnd = i.trialEnd && i.trialEnd.getTime() > Date.now() + 49 * 3600_000 ? i.trialEnd : null; // Stripe exige ≥ 48 h
    const s = await this.call("POST", "/checkout/sessions", {
      mode: "subscription",
      line_items: [{ price: i.priceId, quantity: 1 }],
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      client_reference_id: i.orgId,
      metadata: { orgId: i.orgId, planId: i.planId },
      subscription_data: { metadata: { orgId: i.orgId, planId: i.planId }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      ...(i.customerId ? { customer: i.customerId } : i.customerEmail ? { customer_email: i.customerEmail } : {}),
      locale: "pt-BR",
    });
    const url = str(s.url);
    if (!url) throw new AppError("external_service", "O serviço de pagamento não devolveu o endereço do checkout.");
    return { url, sessionId: str(s.id) ?? "" };
  }

  async createPortalSession(i: { customerId: string; returnUrl: string }) {
    const s = await this.call("POST", "/billing_portal/sessions", { customer: i.customerId, return_url: i.returnUrl });
    const url = str(s.url);
    if (!url) throw new AppError("external_service", "O serviço de pagamento não devolveu o endereço do portal.");
    return { url };
  }

  async cancel(subscriptionId: string) {
    return normalizeSubscription(await this.call("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: true }));
  }

  async resume(subscriptionId: string) {
    return normalizeSubscription(await this.call("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: false }));
  }

  parseWebhook(rawBody: string, headers: Headers): WebhookEvent {
    const v = verifyStripeSignature(rawBody, headers.get("stripe-signature"), this.cfg.webhookSecret);
    if (!v.ok) throw new WebhookSignatureError(v.reason);
    let evt: Json;
    try { evt = obj(JSON.parse(rawBody)); } catch { throw new WebhookSignatureError("malformed_body"); }
    if (!str(evt.id) || !str(evt.type)) throw new WebhookSignatureError("malformed_body");
    return normalizeStripeEvent(evt);
  }
}
