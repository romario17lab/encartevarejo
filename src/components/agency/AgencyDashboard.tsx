"use client";
import { useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { LoadingBlock, PageHeader, confirmAction } from "@/components/app/common";
import { IconPlus, IconStore } from "@/components/app/icons";
import { ROLE_LABEL, ROLES, type Role } from "@/domain/campaign";
import { api } from "@/lib/client/api";
import { SEGMENTS } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

interface AgencyStatus {
  orgId: string; orgName: string; isAgency: boolean; featureAvailable: boolean; planName: string;
  managedBy: { id: string; name: string } | null; canManage: boolean;
}
interface ClientRow {
  id: string; name: string; role: Role; roleLabel: string; suspended: boolean;
  counts: { stores: number; inReview: number; scheduled: number; published: number; pendingApprovals: number };
}
interface AgencyMember { userId: string; name: string; email: string; role: Role }

async function switchTo(orgId: string, to = "/app") {
  try { await api.post("/api/me/active-org", { orgId }); window.location.assign(to); }
  catch (e) { toast((e as Error).message, "error"); }
}

export function AgencyDashboard() {
  const status = useApi<AgencyStatus>("/api/agency");
  if (status.loading && !status.data) return <LoadingBlock />;
  if (status.error) return <ErrorState message={status.error.message} onRetry={status.reload} />;
  const s = status.data!;
  if (s.managedBy) return <ClientSideView s={s} />;
  if (!s.isAgency) return <EnableView s={s} onEnabled={status.reload} />;
  return <AgencyView s={s} />;
}

function EnableView({ s, onEnabled }: { s: AgencyStatus; onEnabled: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Modo agência" description="Gerencie várias lojas clientes, cada uma com identidade, produtos e campanhas separados." />
      <Card>
        <ul className="list-inside list-disc space-y-1 text-sm">
          <li>Cada cliente é uma conta própria: os materiais de um cliente nunca aparecem para outro.</li>
          <li>Você escolhe quem da agência atende cada cliente; o cliente pode convidar a própria equipe.</li>
          <li>Envie prévias para o cliente aprovar por link, com validade e PIN opcional.</li>
        </ul>
        {!s.featureAvailable ? (
          <p className="mt-4 rounded-xl bg-warning/15 p-3 text-sm">O plano {s.planName} não inclui o modo agência. Altere o plano em Conta › Plano e cobrança.</p>
        ) : !s.canManage ? (
          <p className="mt-4 text-sm text-ink-muted">Só um administrador da conta pode ativar o modo agência.</p>
        ) : (
          <div className="mt-4">
            <Button loading={busy} onClick={async () => {
              if (!confirmAction(`Ativar o modo agência em "${s.orgName}"? Esta conta passará a criar e gerenciar contas de clientes.`)) return;
              setBusy(true);
              try { await api.post("/api/agency/enable"); toast("Modo agência ativado.", "success"); await onEnabled(); }
              catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
            }}>Ativar modo agência</Button>
          </div>
        )}
      </Card>
    </>
  );
}

function ClientSideView({ s }: { s: AgencyStatus }) {
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const memberOfAgency = me.orgs.some((o) => o.id === s.managedBy!.id);
  return (
    <>
      <PageHeader title="Agência" description={`A conta "${s.orgName}" é atendida pela agência ${s.managedBy!.name}.`} />
      <Card>
        <p className="text-sm">As pessoas da agência com acesso aparecem em Equipe, como qualquer membro. Elas só veem os dados desta conta enquanto ela estiver ligada à agência.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {memberOfAgency && <Button variant="secondary" onClick={() => switchTo(s.managedBy!.id, "/app/agencia")}>Voltar para a agência</Button>}
          {s.canManage && (
            <Button variant="danger" loading={busy} onClick={async () => {
              if (!confirmAction(`Desligar "${s.orgName}" da agência ${s.managedBy!.name}? As pessoas da agência perderão o acesso a esta conta.`)) return;
              setBusy(true);
              try {
                await api.post("/api/agency/detach");
                toast("Conta desligada da agência.", "success");
                window.location.assign("/app");
              } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
            }}>Desligar da agência</Button>
          )}
        </div>
        {s.canManage && <p className="mt-2 text-xs text-ink-muted">Para desligar, a conta precisa ter um administrador próprio (convide em Equipe).</p>}
      </Card>
    </>
  );
}

function AgencyView({ s }: { s: AgencyStatus }) {
  const list = useApi<{ clients: ClientRow[]; hiddenCount: number }>("/api/agency/clients");
  const [creating, setCreating] = useState(false);
  const detach = async (c: ClientRow) => {
    if (!confirmAction(`Desligar o cliente "${c.name}" da agência? Todas as pessoas da agência perderão o acesso à conta dele.`)) return;
    try { await api.post(`/api/agency/clients/${c.id}/detach`); toast("Cliente desligado.", "success"); await list.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <PageHeader title="Clientes da agência" description="Cada cliente é uma conta separada. Aqui aparecem só contagens; os dados ficam dentro da conta de cada cliente."
        actions={s.canManage ? <Button icon={<IconPlus size={18} />} onClick={() => setCreating(true)}>Novo cliente</Button> : undefined} />
      {list.loading && !list.data && <LoadingBlock />}
      {list.error && <ErrorState message={list.error.message} onRetry={list.reload} />}
      {list.data && !list.data.clients.length && (
        <EmptyState icon={<IconStore size={32} />} title="Nenhum cliente com acesso" description={s.canManage ? "Crie a conta do primeiro cliente: ele terá identidade visual, lojas e campanhas próprias." : "Peça a um administrador da agência para dar acesso a um cliente."}
          action={s.canManage ? <Button onClick={() => setCreating(true)}>Criar cliente</Button> : undefined} />
      )}
      {list.data && list.data.clients.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.clients.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words font-display text-lg font-bold">{c.name}</h2>
                  <Badge>{c.roleLabel}</Badge>
                </div>
                {c.suspended && <p className="mt-1 text-xs font-semibold text-danger">Conta suspensa</p>}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Lojas" value={c.counts.stores} />
                  <Stat label="Em revisão" value={c.counts.inReview} tone={c.counts.inReview ? "warning" : undefined} />
                  <Stat label="Agendadas" value={c.counts.scheduled} />
                  <Stat label="Publicadas" value={c.counts.published} />
                  <Stat label="Aguardando cliente" value={c.counts.pendingApprovals} tone={c.counts.pendingApprovals ? "brand" : undefined} wide />
                </dl>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" onClick={() => switchTo(c.id)}>Entrar na conta</Button>
                  {s.canManage && <Button size="sm" variant="ghost" onClick={() => detach(c)}>Desligar</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.hiddenCount > 0 && (
        <p className="mt-4 text-sm text-ink-muted">Há {list.data.hiddenCount} conta(s) de cliente da agência em que você não tem acesso. Peça acesso a um administrador da conta do cliente.</p>
      )}
      {creating && <CreateClientDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void list.reload(); }} />}
    </>
  );
}

function Stat({ label, value, tone, wide }: { label: string; value: number; tone?: "warning" | "brand"; wide?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${tone === "warning" ? "bg-warning/15" : tone === "brand" ? "bg-brand-soft" : "bg-surface-alt"} ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function CreateClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { me } = useMe();
  const members = useApi<{ members: AgencyMember[] }>("/api/agency/members");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [segment, setSegment] = useState("supermercado");
  const [picked, setPicked] = useState<Record<string, Role | "">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = (members.data?.members ?? []).filter((m) => m.userId !== me.user.id);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await api.post("/api/agency/clients", {
        name, storeName, segment,
        members: Object.entries(picked).filter(([, r]) => r).map(([userId, role]) => ({ userId, role })),
      });
      toast(`Conta "${name}" criada.`, "success");
      onCreated();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Novo cliente" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={name.trim().length < 2 || storeName.trim().length < 2} onClick={submit}>Criar conta do cliente</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label="Nome do cliente" required value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mercado Bom Preço" />
        <Input label="Nome da primeira loja" required value={storeName} maxLength={80} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex.: Bom Preço Centro" />
        <Select label="Segmento" value={segment} onChange={(e) => setSegment(e.target.value)} options={SEGMENTS} />
        <p className="text-sm text-ink-muted">Você entra como administrador do cliente. A identidade visual, os produtos e as campanhas começam vazios e ficam só nesta conta.</p>
        {others.length > 0 && (
          <fieldset>
            <legend className="text-sm font-semibold">Quem mais da agência atende este cliente</legend>
            <ul className="mt-2 flex flex-col gap-2">
              {others.map((m) => (
                <li key={m.userId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-sm"><span className="font-medium">{m.name}</span> <span className="break-all text-ink-muted">{m.email}</span></span>
                  <select aria-label={`Acesso de ${m.name}`} className="h-10 rounded-xl border border-line bg-surface px-2 text-sm" value={picked[m.userId] ?? ""}
                    onChange={(e) => setPicked({ ...picked, [m.userId]: e.target.value as Role | "" })}>
                    <option value="">Sem acesso</option>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
