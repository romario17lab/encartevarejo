"use client";
// Tela "Plano e cobrança": plano e status da assinatura, consumo × limites, comparação de planos
// e ações de cobrança (somente com o provedor de testes configurado e para administradores da conta).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, cx, Dialog, ErrorState, toast } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtBytes, money } from "@/lib/client/format";
import { SubscriptionBanner } from "./SubscriptionBanner";
import type { BillingOverview, Meter, SubscriptionStatus } from "./types";

const STATUS_TONE: Record<SubscriptionStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  teste: "brand", ativa: "success", inadimplente: "danger", cancelada: "warning", encerrada: "neutral",
};

const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
const nf = (n: number) => n.toLocaleString("pt-BR");
const fmtStorage = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : fmtBytes(b));

const EVENT_LABEL: Record<string, string> = {
  "checkout.session.completed": "Assinatura confirmada",
  "customer.subscription.created": "Assinatura criada",
  "customer.subscription.updated": "Assinatura atualizada",
  "customer.subscription.deleted": "Assinatura encerrada",
  "invoice.paid": "Pagamento confirmado",
  "invoice.payment_failed": "Falha no pagamento",
  "charge.refunded": "Reembolso",
  "checkout.iniciado": "Checkout iniciado",
  "cancelamento.agendado": "Cancelamento agendado",
  "cancelamento.desfeito": "Cancelamento desfeito",
  "manual.update": "Ajuste pela equipe de suporte",
};

export function UsageMeter({ label, meter, format = nf, unit = "" }: { label: string; meter: Meter; format?: (n: number) => string; unit?: string }) {
  const included = meter.limit > 0;
  const pct = included ? Math.min(100, Math.round((meter.used / meter.limit) * 100)) : 0;
  const full = included && meter.used >= meter.limit;
  const near = included && !full && pct >= 80;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">
          {included ? <>{format(meter.used)} de {format(meter.limit)}{unit}</> : "Não incluído"}
        </span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        aria-valuetext={included ? `${format(meter.used)} de ${format(meter.limit)}${unit}` : "Não incluído no plano"}
        className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
        <div className={cx("h-full rounded-full transition-[width]", full || near ? "bg-warning" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
      {(full || near) && <p className="text-xs font-semibold text-ink">{full ? "No limite do plano" : "Perto do limite"}</p>}
    </div>
  );
}

function PlanLimitsList({ plan }: { plan: BillingOverview["plans"][number] }) {
  const L = plan.limits;
  const rows = [
    `${nf(L.stores)} loja${L.stores === 1 ? "" : "s"}`,
    `${nf(L.users)} usuário${L.users === 1 ? "" : "s"}`,
    `${L.storageMb >= 1024 ? `${nf(Math.round(L.storageMb / 1024))} GB` : `${nf(L.storageMb)} MB`} de armazenamento`,
    `${nf(L.exportsPerMonth)} exportações por mês`,
    L.aiCreditsPerMonth ? `${nf(L.aiCreditsPerMonth)} créditos de IA por mês` : "Sem recursos de IA",
    L.videoMinutesPerMonth ? `${nf(L.videoMinutesPerMonth)} minutos de vídeo por mês` : "Sem vídeos",
  ];
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-brand">•</span>{r}</li>)}
      {plan.features.length > 0 && <li className="mt-1 text-xs text-ink-muted">Inclui: {plan.features.join(", ")}</li>}
    </ul>
  );
}

export function BillingPanel() {
  const q = useApi<BillingOverview>("/api/billing");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("checkout");
    if (p === "ok") toast("Pagamento enviado. A confirmação pode levar alguns instantes para aparecer aqui.", "success");
    else if (p === "cancelado") toast("Checkout cancelado. Nada foi cobrado.", "info");
  }, []);

  if (q.loading && !q.data) return <><PageHeader title="Plano e cobrança" back={{ href: "/app/conta", label: "Conta" }} /><LoadingBlock /></>;
  if (q.error || !q.data) return <><PageHeader title="Plano e cobrança" back={{ href: "/app/conta", label: "Conta" }} /><ErrorState message={q.error?.message ?? "Não foi possível carregar."} onRetry={q.reload} /></>;
  const d = q.data;
  const s = d.subscription;
  const online = d.provider.configured;
  const manage = d.canManage && online;

  const go = async (key: string, fn: () => Promise<{ url?: string } | BillingOverview>) => {
    setBusy(key);
    try {
      const r = await fn();
      if ("url" in r && r.url) { window.location.assign(r.url); return; }
      q.setData(r as BillingOverview);
      toast("Assinatura atualizada.", "success");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const checkout = (planId: string) => go(`checkout:${planId}`, () => api.post<{ url: string }>("/api/billing/checkout", { planId }));
  const portal = () => go("portal", () => api.post<{ url: string }>("/api/billing/portal"));
  const cancel = () => { setConfirmCancel(false); return go("cancel", () => api.post<BillingOverview>("/api/billing/cancel")); };
  const resume = () => go("resume", () => api.post<BillingOverview>("/api/billing/resume"));

  const dates = [
    s.status === "teste" && s.trialEndsAt ? ["Teste termina em", fmtDay(s.trialEndsAt)] : null,
    s.status === "inadimplente" && s.graceUntil ? ["Regularize até", fmtDay(s.graceUntil)] : null,
    s.currentPeriodEnd && s.status !== "encerrada" ? [s.cancelAtPeriodEnd ? "Acesso até" : "Próxima renovação", fmtDay(s.currentPeriodEnd)] : null,
  ].filter(Boolean) as Array<[string, string]>;
  const canCancel = manage && s.hasProviderSubscription && !s.cancelAtPeriodEnd && ["ativa", "teste", "inadimplente"].includes(s.status);
  const canResume = manage && s.hasProviderSubscription && s.cancelAtPeriodEnd && s.status === "cancelada";
  const hasLiveSub = s.hasProviderSubscription && s.status !== "encerrada";

  return (
    <>
      <PageHeader title="Plano e cobrança" back={{ href: "/app/conta", label: "Conta" }}
        description={<>Plano, consumo do mês e assinatura da conta.</>} />
      <div className="flex flex-col gap-4">
        {d.provider.testMode && (
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-warning/60 bg-warning/15 px-3 py-1 text-xs font-bold text-ink">
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />Ambiente de testes: nenhuma cobrança real
          </p>
        )}
        <SubscriptionBanner hideLink />

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-extrabold">Plano {d.plan.name}</h2>
            <Badge tone={STATUS_TONE[s.status]}>{s.statusLabel}</Badge>
            {d.readOnly && <Badge tone="danger">Somente leitura</Badge>}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{d.readOnly ? "A conta está somente leitura até a situação da assinatura ser regularizada." : s.explanation}</p>
          {d.readOnly && d.reasons.length > 0 && (
            <div className="mt-3 rounded-xl bg-danger/10 p-3 text-sm">
              <p className="font-semibold text-danger">O que está bloqueado</p>
              <p className="mt-1">Criar e editar produtos, campanhas e lojas. Você ainda pode consultar tudo, baixar os dados da conta e cuidar da assinatura aqui.</p>
            </div>
          )}
          {dates.length > 0 && (
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              {dates.map(([k, v]) => <div key={k}><dt className="text-ink-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
          )}
          {online ? (
            d.canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {s.hasPaymentAccount && <Button variant="secondary" loading={busy === "portal"} onClick={portal}>Gerenciar pagamento</Button>}
                {canResume && <Button loading={busy === "resume"} onClick={resume}>Desistir do cancelamento</Button>}
                {canCancel && <Button variant="ghost" className="!text-danger" loading={busy === "cancel"} onClick={() => setConfirmCancel(true)}>Cancelar assinatura…</Button>}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Somente administradores da conta podem alterar o plano e a forma de pagamento.</p>
            )
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-surface-alt p-3 text-sm">
              <p className="font-semibold">O pagamento online ainda não está habilitado.</p>
              <p className="mt-1 text-ink-muted">Para mudar de plano ou cancelar, fale com a nossa equipe de suporte: a alteração é feita por ela, sem cobrança automática.</p>
              {d.provider.problem && <p className="mt-2 text-xs text-ink-muted">Configuração do pagamento: {d.provider.problem}</p>}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display font-bold">Consumo</h2>
          <p className="mt-1 text-sm text-ink-muted">Exportações, IA e vídeo contam a partir do dia 1º de cada mês.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UsageMeter label="Lojas" meter={d.usage.stores} />
            <UsageMeter label="Usuários (com convites)" meter={d.usage.users} />
            <UsageMeter label="Armazenamento" meter={d.usage.storage} format={fmtStorage} />
            <UsageMeter label="Exportações no mês" meter={d.usage.exports} />
            <UsageMeter label="Créditos de IA no mês" meter={d.usage.aiCredits} />
            <UsageMeter label="Minutos de vídeo no mês" meter={d.usage.videoMinutes} />
          </div>
        </Card>

        <section aria-labelledby="planos-titulo">
          <h2 id="planos-titulo" className="mb-3 font-display text-lg font-bold">Planos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {d.plans.map((p) => (
              <Card key={p.id} className={cx("flex flex-col gap-3", p.current && "border-brand ring-2 ring-brand/30")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-extrabold">{p.name}</h3>
                  {p.current && <Badge tone="brand">Plano atual</Badge>}
                </div>
                <p className="text-sm">
                  {p.priceCents == null
                    ? <span className="font-semibold text-ink-muted">Valor a definir</span>
                    : <><span className="font-display text-2xl font-extrabold">{money(p.priceCents)}</span><span className="text-ink-muted"> /mês</span></>}
                </p>
                <PlanLimitsList plan={p} />
                <div className="mt-auto pt-2">
                  {p.current ? null : manage && p.checkoutAvailable ? (
                    hasLiveSub
                      ? <Button variant="secondary" block loading={busy === "portal"} onClick={portal}>Trocar em “Gerenciar pagamento”</Button>
                      : <Button block loading={busy === `checkout:${p.id}`} onClick={() => checkout(p.id)}>Assinar {p.name}</Button>
                  ) : (
                    <p className="text-xs text-ink-muted">{p.priceCents == null || !online ? "Para mudar para este plano, fale com o suporte." : "Somente administradores podem assinar."}</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Recursos pagos (IA e vídeo) têm limite mensal em todos os planos.</p>
        </section>

        {d.canManage && d.history.length > 0 && (
          <Card>
            <h2 className="font-display font-bold">Histórico da cobrança</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {d.history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{EVENT_LABEL[h.type] ?? h.type}{h.status === "ignorado" && <span className="text-ink-muted"> (sem efeito)</span>}</span>
                  <span className="tabular-nums text-ink-muted">{new Date(h.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-sm text-ink-muted">Precisa dos seus dados? <Link href="/app/conta" className="font-semibold text-brand-strong underline underline-offset-2">Baixe tudo em Conta</Link> a qualquer momento, inclusive com a conta somente leitura.</p>
      </div>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancelar assinatura" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Manter assinatura</Button><Button variant="danger" onClick={cancel}>Cancelar no fim do período</Button></>}>
        <p className="text-sm">A assinatura continua funcionando até {fmtDay(s.currentPeriodEnd) ?? "o fim do período pago"}. Depois disso a conta fica somente leitura: nada é apagado e você pode assinar de novo quando quiser.</p>
      </Dialog>
    </>
  );
}
