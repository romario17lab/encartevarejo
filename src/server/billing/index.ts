// Seleção do provedor de cobrança. "stripe" (modo de testes) só quando as duas variáveis
// estão definidas e válidas; caso contrário "manual", e o sistema segue funcionando.
import { billingConfig, type ProviderName } from "./config";
import { ManualProvider } from "./manual";
import { StripeProvider } from "./stripe";
import type { BillingProvider } from "./types";

export { billingConfig } from "./config";
export type { BillingConfig, ProviderName } from "./config";
export * from "./types";

let override: BillingProvider | null = null;
/** Somente testes: substitui o provedor (ex.: Stripe com fetch simulado). */
export function setBillingProviderForTests(p: BillingProvider | null) { override = p; }

export function getBillingProvider(): BillingProvider {
  if (override) return override;
  const cfg = billingConfig();
  return cfg.stripe ? new StripeProvider(cfg.stripe) : new ManualProvider();
}

/** Provedor que recebe webhooks com este nome (null se não configurado). */
export function webhookProvider(name: ProviderName): BillingProvider | null {
  const p = getBillingProvider();
  return p.name === name && p.configured ? p : null;
}
