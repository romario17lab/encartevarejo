// Formato de GET /api/billing (ver src/server/services/subscriptions.ts › billingOverview).
export type SubscriptionStatus = "teste" | "ativa" | "inadimplente" | "cancelada" | "encerrada";
export interface PlanLimits { stores: number; users: number; storageMb: number; exportsPerMonth: number; videoMinutesPerMonth: number; aiCreditsPerMonth: number; features: string[] }
export interface BillingAlert { kind: "trial_ending" | "trial_expired" | "payment_failed" | "cancel_scheduled" | "read_only"; tone: "info" | "warning" | "danger"; message: string }
export interface Meter { used: number; limit: number }
export interface BillingOverview {
  provider: { name: "manual" | "stripe"; configured: boolean; testMode: boolean; problem: string | null };
  canManage: boolean;
  /** conta cliente paga pela agência ("Agência paga") */
  paidByAgency: { id: string; name: string } | null;
  readOnly: boolean;
  reasons: string[];
  alerts: BillingAlert[];
  subscription: {
    status: SubscriptionStatus; statusLabel: string; explanation: string; provider: string; testMode: boolean;
    trialEndsAt: string | null; currentPeriodEnd: string | null; graceUntil: string | null; cancelAtPeriodEnd: boolean;
    hasPaymentAccount: boolean; hasProviderSubscription: boolean;
  };
  plan: { id: string; name: string; priceCents: number | null; limits: PlanLimits };
  usage: { stores: Meter; users: Meter; storage: Meter; exports: Meter; aiCredits: Meter; videoMinutes: Meter };
  plans: Array<{ id: string; name: string; priceCents: number | null; limits: PlanLimits; features: string[]; current: boolean; checkoutAvailable: boolean }>;
  history: Array<{ type: string; status: string; createdAt: string; provider: string }>;
}
