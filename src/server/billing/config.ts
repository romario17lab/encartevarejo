// Configuração de cobrança lida das variáveis de ambiente. Nunca registra segredos em log.
// Regra do dono (Etapa 4 — "Cobrança em testes"): nenhuma cobrança real. Chaves de produção
// (sk_live_) são recusadas, a menos que BILLING_ALLOW_LIVE=1 seja definido de propósito.

export type ProviderName = "manual" | "stripe";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  testMode: boolean;
}

export interface BillingConfig {
  /** provedor ativo para novas cobranças; "manual" quando não há gateway configurado */
  provider: ProviderName;
  stripe: StripeConfig | null;
  /** motivo (sem segredos) quando o Stripe foi recusado ou está incompleto */
  stripeProblem: string | null;
  trialDays: number;
  graceDays: number;
}

function intEnv(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return def;
  return n;
}

export function billingConfig(): BillingConfig {
  const trialDays = intEnv("BILLING_TRIAL_DAYS", 14, 0, 90);
  const graceDays = intEnv("BILLING_GRACE_DAYS", 7, 0, 60);
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const whsec = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  let stripe: StripeConfig | null = null;
  let stripeProblem: string | null = null;
  if (key || whsec) {
    const isTest = /^(sk|rk)_test_/.test(key);
    const isLive = /^(sk|rk)_live_/.test(key);
    if (!key) stripeProblem = "STRIPE_SECRET_KEY não definida.";
    else if (!whsec) stripeProblem = "STRIPE_WEBHOOK_SECRET não definida.";
    else if (!whsec.startsWith("whsec_")) stripeProblem = "STRIPE_WEBHOOK_SECRET em formato inesperado (deve começar com whsec_).";
    else if (isLive && process.env.BILLING_ALLOW_LIVE !== "1") stripeProblem = "Chave de produção do Stripe recusada: nesta etapa só o modo de testes (sk_test_) é permitido.";
    else if (!isTest && !isLive) stripeProblem = "STRIPE_SECRET_KEY em formato inesperado (deve começar com sk_test_).";
    else stripe = { secretKey: key, webhookSecret: whsec, testMode: isTest };
  }
  return { provider: stripe ? "stripe" : "manual", stripe, stripeProblem, trialDays, graceDays };
}
