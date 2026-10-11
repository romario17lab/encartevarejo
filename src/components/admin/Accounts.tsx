"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Card, Dialog, Input, Select, Textarea, toast } from "@/components/ui";
import { LoadingBlock } from "@/components/app/common";
import { ROLE_LABEL } from "@/domain/campaign";
import { api, qs } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import {
  AdminPageHeader, DetailsText, FilterBar, fmtInt, fmtLimitMb, fmtMb, fmtPrice, fmtPctText, Meter, QueryView, StatCard, SUB_STATUS, SubStatusBadge, TableWrap, td, th,
} from "./shared";

interface AccountRow {
  id: string; name: string; isDemo: boolean; planId: string; planName: string; suspendedAt: string | null; createdAt: string;
  subscriptionStatus: string | null; subscriptionProvider: string | null; trialEndsAt: string | null;
  stores: number; users: number; storageBytes: number; storageLimitMb: number; storesLimit: number; usersLimit: number;
}
interface ListData { accounts: AccountRow[]; total: number; page: number; limit: number }
interface PlanOpt { id: string; name: string; isActive: boolean; priceCents: number | null }

const STATUS_OPTIONS = [{ value: "", label: "Todas" }, ...Object.entries(SUB_STATUS).map(([value, s]) => ({ value, label: s.label })), { value: "sem_assinatura", label: "Sem assinatura" }];

export function AccountsList() {
  return <Suspense fallback={<LoadingBlock />}><AccountsListInner /></Suspense>;
}

function AccountsListInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const params = { q: sp.get("q") ?? "", planId: sp.get("planId") ?? "", status: sp.get("status") ?? "", suspended: sp.get("suspended") ?? "", page: sp.get("page") ?? "" };
  const [form, setForm] = useState(params);
  const query = qs({ ...params, page: params.page || undefined });
  const q = useApi<ListData>(`/api/admin/accounts${query}`);
  const plans = useApi<{ plans: PlanOpt[] }>("/api/admin/plans");
  const go = (p: Partial<typeof params>) => router.push(`/admin/contas${qs({ ...params, ...p })}`);
  return (
    <div>
      <AdminPageHeader title="Contas" description="Contas dos clientes, com plano, assinatura e uso. Ações ficam no detalhe de cada conta." />
      <FilterBar onSubmit={() => go({ ...form, page: "" })}>
        <Input label="Buscar" type="search" placeholder="Nome da conta, e-mail ou nome de membro" value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
        <Select label="Plano" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}
          options={[{ value: "", label: "Todos" }, ...(plans.data?.plans ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <Select label="Assinatura" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={STATUS_OPTIONS} />
        <div className="flex items-end gap-2">
          <div className="flex-1"><Select label="Suspensão" value={form.suspended} onChange={(e) => setForm({ ...form, suspended: e.target.value })}
            options={[{ value: "", label: "Todas" }, { value: "1", label: "Suspensas" }, { value: "0", label: "Não suspensas" }]} /></div>
          <Button type="submit">Filtrar</Button>
        </div>
      </FilterBar>
      <QueryView q={q} empty={{ title: "Nenhuma conta encontrada", description: "Ajuste a busca ou os filtros." }} isEmpty={(d) => !d.accounts.length} loadingLabel="Carregando contas…">
        {(d) => (
          <>
            <p className="mb-2 text-sm text-ink-muted">{fmtInt(d.total)} conta(s)</p>
            <ul className="flex flex-col gap-2 md:hidden">
              {d.accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/contas/${a.id}`} className="block rounded-2xl border border-line bg-surface p-3 shadow-card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.name}</span>
                      {a.suspendedAt && <Badge tone="danger">Suspensa</Badge>}
                      {a.isDemo && <Badge>Demonstração</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>{a.planName}</span><SubStatusBadge status={a.subscriptionStatus} />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{a.stores} loja(s) · {a.users} usuário(s) · {fmtMb(a.storageBytes)} · desde {fmtDate(a.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <TableWrap label="Contas">
                <thead><tr>{["Conta", "Plano", "Assinatura", "Lojas", "Usuários", "Armazenamento", "Criada em"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {d.accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-alt">
                      <td className={td}>
                        <Link href={`/admin/contas/${a.id}`} className="font-semibold text-brand-strong underline-offset-2 hover:underline">{a.name}</Link>
                        <span className="ml-2 inline-flex gap-1">{a.suspendedAt && <Badge tone="danger">Suspensa</Badge>}{a.isDemo && <Badge>Demonstração</Badge>}</span>
                      </td>
                      <td className={td}>{a.planName}</td>
                      <td className={td}><SubStatusBadge status={a.subscriptionStatus} />{a.subscriptionStatus === "teste" && a.trialEndsAt && <span className="block text-xs text-ink-muted">até {fmtDate(a.trialEndsAt)}</span>}</td>
                      <td className={`${td} ev-num`}>{a.stores}/{a.storesLimit}</td>
                      <td className={`${td} ev-num`}>{a.users}/{a.usersLimit}</td>
                      <td className={`${td} ev-num`}>{fmtMb(a.storageBytes)} <span className="text-xs text-ink-muted">de {fmtLimitMb(a.storageLimitMb)}</span></td>
                      <td className={td}>{fmtDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
            {d.total > d.limit && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <Button size="sm" variant="secondary" disabled={d.page <= 1} onClick={() => go({ page: String(d.page - 1) })}>Anterior</Button>
                <span className="text-sm text-ink-muted">Página {d.page} de {Math.ceil(d.total / d.limit)}</span>
                <Button size="sm" variant="secondary" disabled={d.page * d.limit >= d.total} onClick={() => go({ page: String(d.page + 1) })}>Próxima</Button>
              </div>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}

// ---------------- Detalhe ----------------
interface Detail {
  org: { id: string; name: string; kind: string; planId: string; isDemo: boolean; suspendedAt: string | null; deletedAt: string | null; createdAt: string };
  plan: { id: string; name: string; limits: { stores: number; users: number; storageMb: number; exportsPerMonth: number; videoMinutesPerMonth: number; aiCreditsPerMonth: number }; priceCents: number | null } | null;
  subscription: { provider: string; status: string; testMode: boolean; currentPeriodEnd: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean; graceUntil: string | null; linkedToProvider: boolean; updatedAt: string } | null;
  members: Array<{ userId: string; name: string; email: string; role: keyof typeof ROLE_LABEL; storeIds: string[] | null; since: string; isPlatformAdmin: boolean }>;
  stores: Array<{ id: string; name: string; slug: string; address: { city?: string; state?: string }; storefrontEnabled: boolean; deletedAt: string | null }>;
  usage: { storageBytes: number; exportsThisMonth: number; aiCreditsThisMonth: number; videoSecondsThisMonth: number };
  campaigns: number;
  recentAudit: Array<{ id: number; action: string; summary: string; createdAt: string; userName: string | null }>;
  adminActions: Array<{ id: number; action: string; details: Record<string, unknown>; createdAt: string; adminName: string | null }>;
  billing: Array<{ id: string; provider: string; type: string; status: string; testMode: boolean; createdAt: string }>;
}

const ADMIN_ACTION: Record<string, string> = {
  "org.plan_change": "Plano alterado", "org.trial_extend": "Teste estendido", "org.suspend": "Conta suspensa", "org.reactivate": "Conta reativada",
};

export function AccountDetail({ id }: { id: string }) {
  const q = useApi<Detail>(`/api/admin/accounts/${encodeURIComponent(id)}`);
  const [dlg, setDlg] = useState<"plan" | "trial" | "suspend" | "reactivate" | null>(null);
  const done = () => { setDlg(null); void q.reload(); };
  return (
    <div>
      <QueryView q={q} loadingLabel="Carregando conta…">
        {(d) => {
          const lim = d.plan?.limits;
          const pct = (u: number, l: number) => (l > 0 ? (u / l) * 100 : u > 0 ? null : 0);
          return (
            <>
              <AdminPageHeader back={{ href: "/admin/contas", label: "Contas" }} title={d.org.name}
                description={<span className="flex flex-wrap items-center gap-2">
                  <code className="text-xs">{d.org.id}</code>
                  {d.org.suspendedAt && <Badge tone="danger">Suspensa desde {fmtDate(d.org.suspendedAt)}</Badge>}
                  {d.org.deletedAt && <Badge tone="danger">Excluída</Badge>}
                  {d.org.isDemo && <Badge>Demonstração</Badge>}
                  <span>Criada em {fmtDate(d.org.createdAt)}</span>
                </span>}
                actions={!d.org.deletedAt && <>
                  <Button size="sm" variant="secondary" onClick={() => setDlg("plan")}>Alterar plano</Button>
                  <Button size="sm" variant="secondary" onClick={() => setDlg("trial")} disabled={d.subscription?.status === "ativa"}>Estender teste</Button>
                  {d.org.suspendedAt
                    ? <Button size="sm" onClick={() => setDlg("reactivate")}>Reativar conta</Button>
                    : <Button size="sm" variant="danger" onClick={() => setDlg("suspend")}>Suspender conta</Button>}
                </>} />
              {d.org.suspendedAt && (
                <p className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm">Conta suspensa: os usuários não conseguem usar a conta (erro “account_suspended”). Continuam podendo entrar, ver seus dados de perfil e baixar a exportação dos dados.</p>
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Plano" value={d.plan?.name ?? d.org.planId} hint={fmtPrice(d.plan?.priceCents)} />
                <StatCard label="Assinatura" value={<SubStatusBadge status={d.subscription?.status} />}
                  hint={d.subscription ? `${d.subscription.provider === "manual" ? "Manual" : d.subscription.provider}${d.subscription.trialEndsAt ? ` · teste até ${fmtDate(d.subscription.trialEndsAt)}` : ""}${d.subscription.currentPeriodEnd ? ` · período até ${fmtDate(d.subscription.currentPeriodEnd)}` : ""}` : "sem linha de assinatura"} />
                <StatCard label="Campanhas" value={fmtInt(d.campaigns)} />
                <StatCard label="Lojas / usuários" value={`${d.stores.filter((s) => !s.deletedAt).length} / ${d.members.length}`} hint={lim ? `limite ${lim.stores} / ${lim.users}` : undefined} />
              </div>

              {lim && (
                <Card className="mt-4">
                  <h2 className="mb-3 font-display text-base font-bold">Consumo deste mês</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: "Armazenamento", used: fmtMb(d.usage.storageBytes), limit: fmtLimitMb(lim.storageMb), pct: pct(d.usage.storageBytes / 1048576, lim.storageMb) },
                      { label: "Exportações", used: fmtInt(d.usage.exportsThisMonth), limit: lim.exportsPerMonth ? fmtInt(lim.exportsPerMonth) : "sem limite", pct: lim.exportsPerMonth ? pct(d.usage.exportsThisMonth, lim.exportsPerMonth) : 0 },
                      { label: "Créditos de IA", used: fmtInt(d.usage.aiCreditsThisMonth), limit: fmtInt(lim.aiCreditsPerMonth), pct: pct(d.usage.aiCreditsThisMonth, lim.aiCreditsPerMonth) },
                      { label: "Vídeo", used: `${fmtInt(Math.round(d.usage.videoSecondsThisMonth / 60))} min`, limit: `${fmtInt(lim.videoMinutesPerMonth)} min`, pct: pct(d.usage.videoSecondsThisMonth, lim.videoMinutesPerMonth * 60) },
                    ].map((m) => (
                      <div key={m.label}>
                        <p className="text-sm"><span className="font-semibold">{m.label}:</span> <span className="ev-num">{m.used}</span> <span className="text-ink-muted">de {m.limit}</span></p>
                        <Meter pct={m.pct} label={`${m.label}: ${fmtPctText(m.pct)}`} />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="min-w-0">
                  <h2 className="mb-2 font-display text-base font-bold">Membros</h2>
                  <TableWrap label="Membros da conta">
                    <thead><tr><th className={th}>Nome</th><th className={th}>E-mail</th><th className={th}>Papel</th><th className={th}>Desde</th></tr></thead>
                    <tbody>
                      {d.members.map((m) => (
                        <tr key={m.userId}>
                          <td className={td}>{m.name}{m.isPlatformAdmin && <span className="ml-1"><Badge tone="accent">admin plataforma</Badge></span>}</td>
                          <td className={`${td} break-all`}>{m.email}</td>
                          <td className={td}>{ROLE_LABEL[m.role] ?? m.role}{m.storeIds ? <span className="block text-xs text-ink-muted">{m.storeIds.length} loja(s)</span> : null}</td>
                          <td className={td}>{fmtDate(m.since)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </section>
                <section className="min-w-0">
                  <h2 className="mb-2 font-display text-base font-bold">Lojas</h2>
                  <TableWrap label="Lojas da conta">
                    <thead><tr><th className={th}>Loja</th><th className={th}>Cidade</th><th className={th}>Vitrine</th></tr></thead>
                    <tbody>
                      {d.stores.map((s) => (
                        <tr key={s.id}>
                          <td className={td}>{s.name}{s.deletedAt && <span className="ml-1"><Badge tone="danger">excluída</Badge></span>}<span className="block text-xs text-ink-muted">/loja/{s.slug}</span></td>
                          <td className={td}>{[s.address?.city, s.address?.state].filter(Boolean).join(" / ") || "—"}</td>
                          <td className={td}>{s.storefrontEnabled ? "Ativa" : "Desligada"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </section>
                <section className="min-w-0">
                  <h2 className="mb-2 font-display text-base font-bold">Ações da administração nesta conta</h2>
                  {d.adminActions.length ? (
                    <ul className="flex flex-col gap-2">
                      {d.adminActions.map((a) => (
                        <li key={a.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                          <p><span className="font-semibold">{ADMIN_ACTION[a.action] ?? a.action}</span> <span className="text-ink-muted">· {a.adminName ?? "—"} · {fmtDateTime(a.createdAt)}</span></p>
                          <div className="mt-1"><DetailsText data={a.details} /></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-ink-muted">Nenhuma ação registrada.</p>}
                </section>
                <section className="min-w-0">
                  <h2 className="mb-2 font-display text-base font-bold">Histórico recente da conta</h2>
                  {d.recentAudit.length ? (
                    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface text-sm">
                      {d.recentAudit.map((a) => (
                        <li key={a.id} className="p-3"><p>{a.summary}</p><p className="text-xs text-ink-muted">{a.userName ?? "sistema"} · {fmtDateTime(a.createdAt)}</p></li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-ink-muted">Sem registros.</p>}
                  <h2 className="mb-2 mt-4 font-display text-base font-bold">Eventos de cobrança</h2>
                  {d.billing.length ? (
                    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface text-sm">
                      {d.billing.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <span><span className="font-semibold">{b.type}</span> <span className="text-ink-muted">· {b.provider}{b.testMode ? " (testes)" : ""}</span></span>
                          <span className="text-xs text-ink-muted">{b.status} · {fmtDateTime(b.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-ink-muted">Nenhum evento.</p>}
                  <Link href={`/admin/cobranca?orgId=${d.org.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-strong hover:underline">Ver todos os eventos desta conta</Link>
                </section>
              </div>
              {dlg === "plan" && <ChangePlanDialog d={d} onClose={() => setDlg(null)} onDone={done} />}
              {dlg === "trial" && <TrialDialog d={d} onClose={() => setDlg(null)} onDone={done} />}
              {dlg === "suspend" && <SuspendDialog d={d} onClose={() => setDlg(null)} onDone={done} />}
              {dlg === "reactivate" && <ReactivateDialog d={d} onClose={() => setDlg(null)} onDone={done} />}
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

function useAction(path: string, ok: string, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (body: unknown) => {
    setBusy(true); setError(null);
    try { await api.post(path, body); toast(ok, "success"); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function ChangePlanDialog({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const plans = useApi<{ plans: PlanOpt[] }>("/api/admin/plans");
  const [planId, setPlanId] = useState(d.org.planId);
  const [status, setStatus] = useState(d.subscription?.status && d.subscription.status !== "encerrada" ? d.subscription.status : "ativa");
  const [note, setNote] = useState("");
  const a = useAction(`/api/admin/accounts/${d.org.id}/plan`, "Plano da conta alterado.", onDone);
  return (
    <Dialog open onClose={onClose} title="Alterar plano manualmente"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={a.busy} onClick={() => void a.run({ planId, status, note: note || undefined })}>Confirmar alteração</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <Select label="Novo plano" value={planId} onChange={(e) => setPlanId(e.target.value)}
          options={(plans.data?.plans ?? [{ id: d.org.planId, name: d.plan?.name ?? d.org.planId, isActive: true, priceCents: null }]).map((p) => ({ value: p.id, label: `${p.name} — ${fmtPrice(p.priceCents)}${p.isActive ? "" : " (inativo)"}` }))} />
        <Select label="Situação da assinatura" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(SUB_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
        <Textarea label="Observação (fica no registro)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-ink-muted">A assinatura passa a ser gerida manualmente (provedor “manual”) e um evento de cobrança manual é registrado. Nenhum dado da conta é apagado, mesmo se o plano novo tiver limites menores.</p>
        {d.subscription?.linkedToProvider && <p className="rounded-lg bg-warning/15 p-2">Esta conta tem assinatura vinculada a um provedor de pagamento. Confira a cobrança no provedor para não cobrar em duplicidade.</p>}
        {a.error && <p role="alert" className="font-medium text-danger">{a.error}</p>}
      </div>
    </Dialog>
  );
}

function TrialDialog({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const a = useAction(`/api/admin/accounts/${d.org.id}/trial`, "Período de teste estendido.", onDone);
  const n = Number(days);
  const err = !/^\d+$/.test(days) || n < 1 || n > 90 ? "Informe de 1 a 90 dias." : null;
  return (
    <Dialog open size="sm" onClose={onClose} title="Estender período de teste"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={a.busy} disabled={!!err} onClick={() => void a.run({ days: n, note: note || undefined })}>Estender</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p>Teste atual: {d.subscription?.trialEndsAt ? `até ${fmtDate(d.subscription.trialEndsAt)}` : "não iniciado"}. Os dias são somados ao fim atual (ou a partir de hoje).</p>
        <Input label="Dias a mais" inputMode="numeric" value={days} error={err} onChange={(e) => setDays(e.target.value)} />
        <Textarea label="Observação (opcional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {a.error && <p role="alert" className="font-medium text-danger">{a.error}</p>}
      </div>
    </Dialog>
  );
}

function SuspendDialog({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const a = useAction(`/api/admin/accounts/${d.org.id}/suspend`, "Conta suspensa.", onDone);
  const err = reason.trim().length < 5 ? "Descreva o motivo (mínimo 5 caracteres)." : null;
  return (
    <Dialog open onClose={onClose} title={`Suspender ${d.org.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={a.busy} disabled={!!err} onClick={() => void a.run({ reason })}>Suspender conta</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p>Os usuários da conta deixam de conseguir usá-la (campanhas, produtos, exportações). Nenhum dado é apagado e a conta pode ser reativada a qualquer momento. A exportação dos dados da conta continua disponível.</p>
        <Textarea label="Motivo (fica no registro de ações)" required maxLength={500} value={reason} error={reason ? err : null} onChange={(e) => setReason(e.target.value)} />
        {a.error && <p role="alert" className="font-medium text-danger">{a.error}</p>}
      </div>
    </Dialog>
  );
}

function ReactivateDialog({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const a = useAction(`/api/admin/accounts/${d.org.id}/reactivate`, "Conta reativada.", onDone);
  return (
    <Dialog open size="sm" onClose={onClose} title={`Reativar ${d.org.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={a.busy} onClick={() => void a.run({ note: note || undefined })}>Reativar</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p>Os usuários voltam a usar a conta normalmente.</p>
        <Textarea label="Observação (opcional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {a.error && <p role="alert" className="font-medium text-danger">{a.error}</p>}
      </div>
    </Dialog>
  );
}
