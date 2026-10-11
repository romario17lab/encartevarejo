"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, cx, EmptyState, ErrorState, Select } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { FORMATS, type FormatId } from "@/domain/formats";
import { qs } from "@/lib/client/api";
import { useApi, useMe } from "@/lib/client/hooks";
import { originLabel } from "@/components/campaign/origins";
import { DailyChart } from "./DailyChart";

// Tela de métricas (/app/metricas): números simples e honestos. Cliques no WhatsApp são interesse, não vendas.

interface Counts { views: number; whatsappClicks: number; shares: number; qrAccesses: number }
interface MetricsResponse {
  period: { days: 7 | 30 | 90; from: string; to: string; timezone: string };
  storeId: string | null;
  stores: Array<{ id: string; name: string; slug: string }>;
  totals: Counts;
  series: Array<Counts & { date: string }>;
  byOrigin: Array<{ source: string | null; views: number; whatsappClicks: number; shares: number }>;
  byCampaign: Array<{ campaignId: string | null; name: string | null; views: number; whatsappClicks: number; shares: number }>;
  campaigns: { created: number; published: number; ended: number };
  exports: { completed: number; failed: number; packages: number; byFormat: Array<{ format: string; completed: number; failed: number }> };
}

type MetricKey = keyof Counts;
const METRICS: Array<{ key: MetricKey; label: string; short: string; unit: [string, string]; hint: string }> = [
  { key: "views", label: "Visualizações da vitrine", short: "Visualizações", unit: ["visualização", "visualizações"], hint: "Vezes que a vitrine online foi aberta." },
  { key: "whatsappClicks", label: "Cliques no WhatsApp", short: "WhatsApp", unit: ["clique", "cliques"], hint: "Interesse do cliente: não é venda." },
  { key: "shares", label: "Compartilhamentos", short: "Compartilh.", unit: ["compartilhamento", "compartilhamentos"], hint: "Toques em “Compartilhar” na vitrine." },
  { key: "qrAccesses", label: "Acessos por QR code", short: "QR code", unit: ["acesso", "acessos"], hint: "Visitas pelo QR code do cartaz ou encarte." },
];
const PERIODS = [7, 30, 90] as const;
const nf = new Intl.NumberFormat("pt-BR");
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

function Segmented<T extends string | number>({ label, value, options, onChange, className }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx("inline-flex gap-1 rounded-xl bg-ink/5 p-1", className)}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx("min-h-[40px] whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors", value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, hint, note }: { label: string; value: number; hint: string; note?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-3 sm:p-4">
      <p className="text-xs font-semibold text-ink-muted sm:text-sm">{label}</p>
      <p className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl">{nf.format(value)}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
      {note}
    </Card>
  );
}

function Table({ caption, head, rows, empty }: { caption: string; head: string[]; rows: Array<{ key: string; cells: ReactNode[] }>; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            {head.map((h, i) => <th key={h} scope="col" className={cx("py-2 font-semibold", i === 0 ? "pr-2" : "px-2 text-right")}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="py-4 text-center text-ink-muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              {r.cells.map((c, i) => i === 0
                ? <th key={i} scope="row" className="max-w-[180px] break-words py-2 pr-2 text-left font-medium sm:max-w-none">{c}</th>
                : <td key={i} className="px-2 py-2 text-right tabular-nums">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MetricsDashboard() {
  const { me } = useMe();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [store, setStore] = useState<string>("");
  const [metric, setMetric] = useState<MetricKey>("views");
  const q = useApi<MetricsResponse>(`/api/metrics${qs({ periodo: period, loja: store || null })}`, [period, store]);
  const d = q.data;
  const stores = d?.stores ?? me.stores ?? [];
  const m = METRICS.find((x) => x.key === metric)!;
  const noEvents = d && d.totals.views + d.totals.whatsappClicks + d.totals.shares + d.totals.qrAccesses === 0;

  return (
    <>
      <PageHeader title="Métricas" description="Como suas ofertas estão sendo vistas e divulgadas." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium" aria-hidden="true">Período</span>
          <Segmented label="Período" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: `${p} dias` }))} />
        </div>
        {stores.length > 1 && (
          <div className="sm:w-64">
            <Select label="Mostrar dados de" value={store} onChange={(e) => setStore(e.target.value)}
              options={[{ value: "", label: "Todas as lojas" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
        )}
        {d && <p className="text-xs text-ink-muted sm:ml-auto sm:pb-3">{fmtDate(d.period.from)} a {fmtDate(d.period.to)} · horário de Brasília</p>}
      </div>

      {q.error ? (
        <ErrorState title="Não foi possível carregar as métricas" message={q.error.message} onRetry={q.reload} />
      ) : !d ? (
        <LoadingBlock label="Calculando métricas…" />
      ) : (
        <div className={cx("flex flex-col gap-5 transition-opacity", q.loading && "opacity-60")} aria-busy={q.loading || undefined}>
          <p role="note" className="rounded-xl border border-line bg-surface p-3 text-sm">
            <strong>Como ler estes números:</strong> um clique no WhatsApp mostra interesse do cliente, não é uma venda. As métricas contam visitas e toques na vitrine online, sem identificar pessoas, e não medem faturamento.
          </p>

          <section aria-label="Resumo da vitrine" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRICS.map((x) => <Kpi key={x.key} label={x.label} value={d.totals[x.key]} hint={x.hint} />)}
          </section>

          {noEvents ? (
            <EmptyState title="Ainda não há acessos neste período"
              description="Os números aparecem quando clientes abrem a sua vitrine online. Divulgue o link da vitrine no WhatsApp e nas redes, e coloque o QR code nos cartazes e encartes. Em cada campanha, use o botão “Divulgar” para gerar links com a origem e o QR code."
              action={<div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/app/campanhas" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-strong">Divulgar uma campanha</Link>
                {stores[0] && <Link href="/app/loja" className="inline-flex h-11 items-center justify-center rounded-xl border border-line-strong/60 bg-surface px-4 font-semibold hover:bg-surface-alt">Ver dados da vitrine</Link>}
              </div>} />
          ) : (
            <>
              <Card>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-display text-lg font-bold">{m.label} por dia</h2>
                  <Segmented label="Indicador do gráfico" value={metric} onChange={setMetric} className="grid grid-cols-2 sm:inline-flex"
                    options={METRICS.map((x) => ({ value: x.key, label: x.short }))} />
                </div>
                <DailyChart data={d.series.map((s) => ({ date: s.date, value: s[metric] }))} label={m.label} unit={m.unit} />
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer py-2 font-semibold text-brand">Ver dados em tabela</summary>
                  <div className="max-h-72 overflow-auto">
                    <Table caption={`${m.label} por dia`} head={["Dia", "Visualizações", "WhatsApp", "Compartilh.", "QR code"]} empty="Sem dados."
                      rows={[...d.series].reverse().map((s) => ({ key: s.date, cells: [fmtDate(s.date), nf.format(s.views), nf.format(s.whatsappClicks), nf.format(s.shares), nf.format(s.qrAccesses)] }))} />
                  </div>
                </details>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <h2 className="font-display text-lg font-bold">De onde vieram os acessos</h2>
                  <p className="mb-2 text-xs text-ink-muted">Pela origem do link (ex.: ?origem=whatsapp). “Direto” é quem abriu sem origem no link.</p>
                  <Table caption="Acessos por origem" head={["Origem", "Visualiz.", "WhatsApp", "Compart."]} empty="Nenhum acesso no período."
                    rows={d.byOrigin.map((r) => ({ key: r.source ?? "_direto", cells: [originLabel(r.source), nf.format(r.views), nf.format(r.whatsappClicks), nf.format(r.shares)] }))} />
                </Card>
                <Card>
                  <h2 className="font-display text-lg font-bold">Por campanha</h2>
                  <p className="mb-2 text-xs text-ink-muted">Acessos pelo link da campanha ou quando ela era a única oferta na vitrine.</p>
                  <Table caption="Acessos por campanha" head={["Campanha", "Visualiz.", "WhatsApp", "Compart."]} empty="Nenhum acesso no período."
                    rows={d.byCampaign.map((r) => ({
                      key: r.campaignId ?? "_geral",
                      cells: [r.campaignId ? (r.name ? <Link href={`/app/campanhas/${r.campaignId}`} className="underline">{r.name}</Link> : "Campanha excluída") : "Vitrine geral (várias campanhas)", nf.format(r.views), nf.format(r.whatsappClicks), nf.format(r.shares)],
                    }))} />
                </Card>
              </div>
            </>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg font-bold">Campanhas no período</h2>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[["Criadas", d.campaigns.created], ["Publicadas", d.campaigns.published], ["Encerradas", d.campaigns.ended]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface-alt p-3"><dt className="text-xs font-semibold text-ink-muted">{l}</dt><dd className="font-display text-2xl font-extrabold tabular-nums">{nf.format(v as number)}</dd></div>
                ))}
              </dl>
            </Card>
            <Card>
              <h2 className="mb-3 font-display text-lg font-bold">Exportações no período</h2>
              <dl className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-surface-alt p-3"><dt className="text-xs font-semibold text-ink-muted">Concluídas</dt><dd className="font-display text-2xl font-extrabold tabular-nums">{nf.format(d.exports.completed)}</dd></div>
                <div className="rounded-xl bg-surface-alt p-3"><dt className="text-xs font-semibold text-ink-muted">Com falha</dt><dd className={cx("font-display text-2xl font-extrabold tabular-nums", d.exports.failed > 0 && "text-danger")}>{nf.format(d.exports.failed)}</dd></div>
              </dl>
              {d.exports.packages > 0 && <p className="mt-2 text-xs text-ink-muted">{nf.format(d.exports.packages)} {d.exports.packages === 1 ? "pacote completo (ZIP)" : "pacotes completos (ZIP)"} entre as concluídas.</p>}
              {d.exports.byFormat.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer py-2 font-semibold text-brand">Por formato</summary>
                  <Table caption="Exportações por formato" head={["Formato", "Concluídas", "Falhas"]} empty=""
                    rows={d.exports.byFormat.map((r) => ({ key: r.format, cells: [FORMATS[r.format as FormatId]?.label ?? r.format, nf.format(r.completed), nf.format(r.failed)] }))} />
                  <p className="mt-1 text-xs text-ink-muted">Um pacote conta em cada formato que ele contém.</p>
                </details>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
