"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Input, Select, toast } from "@/components/ui";
import { LoadingBlock } from "@/components/app/common";
import { FORMATS, type FormatId } from "@/domain/formats";
import { api, qs } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtDateTime } from "@/lib/client/format";
import { AdminPageHeader, DetailsText, FilterBar, fmtInt, fmtLimitMb, fmtMb, fmtPctText, Meter, QueryView, StatCard, TableWrap, td, th } from "./shared";

// ---------------- Exportações com falha ----------------
interface FailedJob {
  id: string; orgId: string; orgName: string; campaignId: string; campaignName: string | null; campaignVersion: number;
  request: { kind: string; items: Array<{ format: string; fileType: string }> }; attempts: number; error: string | null; createdAt: string; finishedAt: string | null;
}
interface ExportsData { jobs: FailedJob[]; totals: { total: number; failed: number; done: number; pending: number }; days: number }

export function ExportsAdmin() {
  return <Suspense fallback={<LoadingBlock />}><ExportsInner /></Suspense>;
}
function ExportsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const days = sp.get("days") ?? "30";
  const orgId = sp.get("orgId") ?? "";
  const q = useApi<ExportsData>(`/api/admin/exports${qs({ days, orgId })}`);
  const [busy, setBusy] = useState<string | null>(null);
  const retry = async (j: FailedJob) => {
    setBusy(j.id);
    try {
      const r = await api.post<{ queued: boolean; status: string; error: string | null }>(`/api/admin/exports/${j.id}/retry`, {});
      toast(r.status === "falhou" ? `Reenviada, mas falhou de novo: ${r.error ?? "erro"}` : r.status === "concluida" ? "Exportação gerada." : "Exportação reenviada para a fila.", r.status === "falhou" ? "error" : "success");
      void q.reload();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(null); }
  };
  const fmtLabel = (f: string, t: string) => `${FORMATS[f as FormatId]?.label ?? f} ${t.toUpperCase()}`;
  return (
    <div>
      <AdminPageHeader title="Falhas de exportação"
        description="Exportações que terminaram com erro, em todas as contas. “Reenviar” coloca o mesmo pedido (mesma versão da campanha) de volta na fila do worker; o cliente vê o arquivo pronto na lista de exportações da campanha." />
      <FilterBar>
        <Select label="Período" value={days} onChange={(e) => router.push(`/admin/exportacoes${qs({ days: e.target.value, orgId })}`)}
          options={[{ value: "1", label: "Últimas 24 horas" }, { value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }]} />
        {orgId && <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => router.push(`/admin/exportacoes${qs({ days })}`)}>Ver todas as contas</Button></div>}
      </FilterBar>
      <QueryView q={q} loadingLabel="Carregando exportações…">
        {(d) => (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Exportações no período" value={fmtInt(d.totals.total)} />
              <StatCard label="Com falha" value={fmtInt(d.totals.failed)} tone={d.totals.failed ? "danger" : undefined} hint={d.totals.total ? `${((d.totals.failed / d.totals.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do total` : undefined} />
              <StatCard label="Concluídas" value={fmtInt(d.totals.done)} />
              <StatCard label="Na fila / gerando" value={fmtInt(d.totals.pending)} />
            </div>
            {!d.jobs.length ? (
              <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">Nenhuma exportação com falha no período.</p>
            ) : (
              <TableWrap label="Exportações com falha">
                <thead><tr>{["Data", "Conta", "Campanha", "Formatos", "Erro", ""].map((h, i) => <th key={i} className={th}>{h || <span className="sr-only">Ações</span>}</th>)}</tr></thead>
                <tbody>
                  {d.jobs.map((j) => (
                    <tr key={j.id}>
                      <td className={`${td} whitespace-nowrap`}>{fmtDateTime(j.createdAt)}<span className="block text-xs text-ink-muted">{j.attempts} tentativa(s)</span></td>
                      <td className={td}><Link className="font-semibold text-brand-strong hover:underline" href={`/admin/contas/${j.orgId}`}>{j.orgName}</Link></td>
                      <td className={td}>{j.campaignName ?? "—"}<span className="block text-xs text-ink-muted">versão {j.campaignVersion}</span></td>
                      <td className={td}>{j.request.kind === "package" ? <Badge>Pacote</Badge> : null} <span className="text-xs">{j.request.items.map((i) => fmtLabel(i.format, i.fileType)).join(", ")}</span></td>
                      <td className={`${td} max-w-[280px] text-danger`}>{j.error ?? "—"}</td>
                      <td className={`${td} text-right`}><Button size="sm" variant="secondary" loading={busy === j.id} onClick={() => void retry(j)}>Reenviar</Button></td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}

// ---------------- Consumo ----------------
interface UsageRow {
  orgId: string; orgName: string; planName: string; suspended: boolean; isDemo: boolean;
  storageBytes: number; storageLimitMb: number; storagePct: number | null;
  exportsThisMonth: number; exportsLimit: number; exportsPct: number | null;
  aiCredits: number; aiLimit: number; aiPct: number | null;
  videoSeconds: number; videoLimitSeconds: number; videoPct: number | null;
}
interface UsageData { rows: UsageRow[]; totalOrgs: number; totals: { storageBytes: number; exportsThisMonth: number; aiCredits: number; videoSeconds: number; overLimit: number }; monthStart: string }

export function UsageAdmin() {
  const [sort, setSort] = useState("storage");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const q = useApi<UsageData>(`/api/admin/usage${qs({ sort, q: applied })}`);
  const cell = (used: string, limit: string, pct: number | null, label: string) => (
    <td className={td}><span className="ev-num">{used}</span> <span className="text-xs text-ink-muted">/ {limit}</span><Meter pct={pct} label={`${label}: ${fmtPctText(pct)}`} /></td>
  );
  return (
    <div>
      <AdminPageHeader title="Consumo" description="Armazenamento (total de arquivos da conta) e consumo do mês corrente — exportações, créditos de IA e segundos de vídeo — comparados aos limites do plano." />
      <FilterBar onSubmit={() => setApplied(search)}>
        <Input label="Conta" type="search" value={search} placeholder="Nome da conta" onChange={(e) => setSearch(e.target.value)} />
        <Select label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value)}
          options={[{ value: "storage", label: "Armazenamento" }, { value: "exports", label: "Exportações" }, { value: "ai", label: "IA" }, { value: "video", label: "Vídeo" }, { value: "name", label: "Nome" }]} />
        <div className="flex items-end"><Button type="submit" variant="secondary">Buscar</Button></div>
      </FilterBar>
      <QueryView q={q} empty={{ title: "Nenhuma conta encontrada" }} isEmpty={(d) => !d.rows.length} loadingLabel="Calculando consumo…">
        {(d) => (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Armazenamento total" value={fmtMb(d.totals.storageBytes)} />
              <StatCard label="Exportações (mês)" value={fmtInt(d.totals.exportsThisMonth)} />
              <StatCard label="Créditos de IA (mês)" value={fmtInt(d.totals.aiCredits)} />
              <StatCard label="Vídeo (mês)" value={`${fmtInt(Math.round(d.totals.videoSeconds / 60))} min`} />
              <StatCard label="Contas no limite" value={fmtInt(d.totals.overLimit)} tone={d.totals.overLimit ? "warning" : undefined} hint="algum recurso em 100% ou mais" />
            </div>
            <TableWrap label="Consumo por conta">
              <thead><tr>{["Conta", "Armazenamento", "Exportações (mês)", "IA (mês)", "Vídeo (mês)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.orgId}>
                    <td className={td}>
                      <Link className="font-semibold text-brand-strong hover:underline" href={`/admin/contas/${r.orgId}`}>{r.orgName}</Link>
                      <span className="block text-xs text-ink-muted">{r.planName}{r.suspended ? " · suspensa" : ""}{r.isDemo ? " · demonstração" : ""}</span>
                    </td>
                    {cell(fmtMb(r.storageBytes), fmtLimitMb(r.storageLimitMb), r.storagePct, "Armazenamento")}
                    {cell(fmtInt(r.exportsThisMonth), r.exportsLimit ? fmtInt(r.exportsLimit) : "sem limite", r.exportsLimit ? r.exportsPct : 0, "Exportações")}
                    {cell(fmtInt(r.aiCredits), fmtInt(r.aiLimit), r.aiPct, "IA")}
                    {cell(`${fmtInt(Math.round(r.videoSeconds / 60))} min`, `${fmtInt(r.videoLimitSeconds / 60)} min`, r.videoPct, "Vídeo")}
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            {d.totalOrgs > d.rows.length && <p className="mt-2 text-xs text-ink-muted">Mostrando {d.rows.length} de {d.totalOrgs} contas. Use a busca para encontrar outras.</p>}
          </>
        )}
      </QueryView>
    </div>
  );
}

// ---------------- Cobrança ----------------
interface BillingEvent { id: string; orgId: string | null; orgName: string | null; provider: string; type: string; testMode: boolean; status: string; error: string | null; summary: Record<string, unknown>; createdAt: string }
interface BillingData { events: BillingEvent[]; nextBefore: string | null; providers: string[]; types: string[] }

export function BillingAdmin() {
  return <Suspense fallback={<LoadingBlock />}><BillingInner /></Suspense>;
}
function BillingInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const f = { provider: sp.get("provider") ?? "", type: sp.get("type") ?? "", status: sp.get("status") ?? "", orgId: sp.get("orgId") ?? "", testMode: sp.get("testMode") ?? "" };
  const [before, setBefore] = useState<string | null>(null);
  const q = useApi<BillingData>(`/api/admin/billing-events${qs({ ...f, before })}`);
  const set = (p: Partial<typeof f>) => { setBefore(null); router.push(`/admin/cobranca${qs({ ...f, ...p })}`); };
  const st: Record<string, "success" | "neutral" | "danger"> = { processado: "success", ignorado: "neutral", falhou: "danger" };
  return (
    <div>
      <AdminPageHeader title="Eventos de assinatura e cobrança"
        description="Eventos recebidos do provedor de pagamento e ações manuais da administração. Dados de cartão, documentos e contatos nunca são exibidos." />
      <FilterBar>
        <Select label="Provedor" value={f.provider} onChange={(e) => set({ provider: e.target.value })} options={[{ value: "", label: "Todos" }, ...(q.data?.providers ?? (f.provider ? [f.provider] : [])).map((p) => ({ value: p, label: p }))]} />
        <Select label="Tipo" value={f.type} onChange={(e) => set({ type: e.target.value })} options={[{ value: "", label: "Todos" }, ...(q.data?.types ?? (f.type ? [f.type] : [])).map((t) => ({ value: t, label: t }))]} />
        <Select label="Situação" value={f.status} onChange={(e) => set({ status: e.target.value })} options={[{ value: "", label: "Todas" }, { value: "processado", label: "Processado" }, { value: "ignorado", label: "Ignorado" }, { value: "falhou", label: "Falhou" }]} />
        <Select label="Ambiente" value={f.testMode} onChange={(e) => set({ testMode: e.target.value })} options={[{ value: "", label: "Todos" }, { value: "1", label: "Testes" }, { value: "0", label: "Produção" }]} />
      </FilterBar>
      {f.orgId && <p className="mb-3 text-sm">Filtrando pela conta <code>{f.orgId}</code>. <button type="button" className="font-semibold text-brand-strong hover:underline" onClick={() => set({ orgId: "" })}>Ver todas</button></p>}
      <QueryView q={q} empty={{ title: "Nenhum evento de cobrança", description: "Os eventos aparecem quando o provedor envia notificações ou quando a administração altera planos manualmente." }} isEmpty={(d) => !d.events.length} loadingLabel="Carregando eventos…">
        {(d) => (
          <>
            <TableWrap label="Eventos de cobrança">
              <thead><tr>{["Data", "Conta", "Evento", "Situação", "Resumo"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDateTime(e.createdAt)}</td>
                    <td className={td}>{e.orgId ? <Link className="font-semibold text-brand-strong hover:underline" href={`/admin/contas/${e.orgId}`}>{e.orgName ?? e.orgId}</Link> : "—"}</td>
                    <td className={td}><span className="font-semibold">{e.type}</span><span className="block text-xs text-ink-muted">{e.provider}{e.testMode ? " · testes" : " · produção"}</span></td>
                    <td className={td}><Badge tone={st[e.status] ?? "neutral"}>{e.status}</Badge>{e.error && <span className="mt-1 block text-xs text-danger">{e.error}</span>}</td>
                    <td className={`${td} min-w-[220px]`}><DetailsText data={e.summary} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="mt-3 flex gap-2">
              {before && <Button size="sm" variant="secondary" onClick={() => setBefore(null)}>Mais recentes</Button>}
              {d.nextBefore && <Button size="sm" variant="secondary" onClick={() => setBefore(d.nextBefore)}>Mais antigos</Button>}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
