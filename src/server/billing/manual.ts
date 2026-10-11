// Provedor "manual": sem gateway e sem credenciais. A assinatura é ajustada pela equipe
// da plataforma (administração). É o padrão enquanto o pagamento online não está habilitado.
import { AppError } from "../errors";
import { WebhookSignatureError, type BillingProvider } from "./types";

export const PAYMENT_NOT_ENABLED = "O pagamento online ainda não está habilitado. Para mudar de plano ou cancelar, fale com a nossa equipe de suporte.";

export class ManualProvider implements BillingProvider {
  readonly name = "manual" as const;
  readonly configured = false;
  readonly testMode = true;
  async createCheckout(): Promise<never> { throw new AppError("validation", PAYMENT_NOT_ENABLED); }
  async createPortalSession(): Promise<never> { throw new AppError("validation", PAYMENT_NOT_ENABLED); }
  async cancel(): Promise<never> { throw new AppError("validation", PAYMENT_NOT_ENABLED); }
  async resume(): Promise<never> { throw new AppError("validation", PAYMENT_NOT_ENABLED); }
  parseWebhook(): never { throw new WebhookSignatureError("provider_not_configured"); }
}
