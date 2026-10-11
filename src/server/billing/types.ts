// Contrato dos provedores de cobrança. O resto do sistema só conhece estes tipos,
// nunca o formato bruto do gateway.
import type { ProviderName } from "./config";

export type { ProviderName };

export interface CheckoutInput {
  orgId: string;
  planId: string;
  /** id do preço no provedor (plans.providerPriceId) */
  priceId: string;
  customerId: string | null;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** fim do teste ainda vigente (o provedor só aplica se for no futuro) */
  trialEnd: Date | null;
}

/** Retrato da assinatura no provedor, já normalizado. */
export interface ProviderSubscription {
  id: string;
  customerId: string | null;
  /** status bruto do provedor (ex.: "active", "past_due") */
  rawStatus: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  orgIdHint: string | null;
}

export type WebhookKind =
  | "checkout_completed" | "subscription_snapshot" | "subscription_deleted"
  | "invoice_paid" | "invoice_payment_failed" | "charge_refunded" | "other";

/** Evento de webhook validado e normalizado. `summary` não contém dados sensíveis. */
export interface WebhookEvent {
  provider: ProviderName;
  id: string;
  type: string;
  kind: WebhookKind;
  createdAt: Date;
  testMode: boolean;
  orgIdHint: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  planIdHint?: string | null;
  subscription?: ProviderSubscription;
  /** checkout: true quando nada foi cobrado agora (ex.: início com teste) */
  noPaymentRequired?: boolean;
  invoice?: { amountCents: number | null; periodEnd: Date | null };
  refund?: { amountCents: number; refundedCents: number; full: boolean };
  summary: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: ProviderName;
  readonly configured: boolean;
  readonly testMode: boolean;
  createCheckout(input: CheckoutInput): Promise<{ url: string; sessionId: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** agenda o cancelamento para o fim do período pago */
  cancel(subscriptionId: string): Promise<ProviderSubscription>;
  /** desfaz o cancelamento agendado */
  resume(subscriptionId: string): Promise<ProviderSubscription>;
  /** valida a assinatura do webhook e normaliza; lança WebhookSignatureError se inválido */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent;
}

export class WebhookSignatureError extends Error {
  constructor(public readonly reason: string) { super(`assinatura de webhook inválida (${reason})`); this.name = "WebhookSignatureError"; }
}
