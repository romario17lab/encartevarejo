"use client";
// Faixa de aviso da assinatura (teste acabando, pagamento pendente, conta somente leitura).
// Montada no AppShell pelo coordenador. Não mostra nada quando não há aviso.
import Link from "next/link";
import { cx } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import type { BillingAlert, BillingOverview } from "./types";

const TONE: Record<BillingAlert["tone"], string> = {
  info: "border-brand/30 bg-brand-soft text-ink",
  warning: "border-warning/50 bg-warning/15 text-ink",
  danger: "border-danger/40 bg-danger/10 text-ink",
};
const TITLE: Record<BillingAlert["kind"], string> = {
  read_only: "Conta somente leitura",
  payment_failed: "Pagamento pendente",
  trial_ending: "Período de teste terminando",
  trial_expired: "Período de teste encerrado",
  cancel_scheduled: "Cancelamento agendado",
};

export function SubscriptionBanner({ className, hideLink }: { className?: string; hideLink?: boolean }) {
  const { data } = useApi<BillingOverview>("/api/billing");
  // cancelamento agendado é informação discreta: aparece só na tela de plano
  const alert = data?.alerts.find((a) => a.kind !== "cancel_scheduled");
  if (!alert) return null;
  const message = alert.kind === "read_only" ? alert.message.replace(/^Conta somente leitura: /, "") : alert.message;
  return (
    <div role={alert.tone === "danger" ? "alert" : "status"} className={cx("flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", TONE[alert.tone], className)}>
      <p><strong className="font-semibold">{TITLE[alert.kind]}.</strong> {message}</p>
      {!hideLink && (
        <Link href="/app/conta/plano" className="shrink-0 font-semibold text-brand-strong underline underline-offset-2 hover:no-underline">
          {data?.canManage ? "Ver plano e cobrança" : "Saiba mais"}
        </Link>
      )}
    </div>
  );
}
