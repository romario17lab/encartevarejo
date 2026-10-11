"use client";
import { useState } from "react";
import { Badge, Button, Card, Dialog, Input, PriceInput, toast } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import { ApiError, api } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { AdminPageHeader, fmtInt, fmtLimitMb, fmtPrice, QueryView } from "./shared";

interface Limits { stores: number; users: number; storageMb: number; exportsPerMonth: number; videoMinutesPerMonth: number; aiCreditsPerMonth: number; features: string[] }
interface Plan { id: string; name: string; limits: Limits; isActive: boolean; priceCents: number | null; providerPriceId: string | null; sortOrder: number; orgCount: number }
interface Data { plans: Plan[]; features: Array<{ value: string; label: string }>; max: Record<string, number> }

const LIMIT_FIELDS: Array<{ key: Exclude<keyof Limits, "features">; label: string; hint?: string }> = [
  { key: "stores", label: "Lojas" },
  { key: "users", label: "Usuários", hint: "inclui convites pendentes" },
  { key: "storageMb", label: "Armazenamento (MB)" },
  { key: "exportsPerMonth", label: "Exportações por mês", hint: "0 = sem limite" },
  { key: "videoMinutesPerMonth", label: "Minutos de vídeo por mês" },
  { key: "aiCreditsPerMonth", label: "Créditos de IA por mês" },
];

export function PlansAdmin() {
  const q = useApi<Data>("/api/admin/plans");
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  return (
    <div>
      <AdminPageHeader title="Planos e limites"
        description="Alterar limites nunca apaga dados de clientes: contas acima de um limite novo só deixam de criar mais itens daquele tipo até ajustar o plano."
        actions={<Button size="sm" onClick={() => setEditing("new")}>Novo plano</Button>} />
      <QueryView q={q} empty={{ title: "Nenhum plano cadastrado", description: "Rode o seed (npm run db:seed) ou crie um plano." }} isEmpty={(d) => !d.plans.length} loadingLabel="Carregando planos…">
        {(d) => (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.plans.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-lg font-bold">{p.name}</h2>
                      <code className="text-xs text-ink-muted">{p.id}</code>
                    </div>
                    {p.isActive ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
                  </div>
                  <p className="font-display text-xl font-extrabold">{fmtPrice(p.priceCents)}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-ink-muted">Lojas</dt><dd className="ev-num">{fmtInt(p.limits.stores)}</dd>
                    <dt className="text-ink-muted">Usuários</dt><dd className="ev-num">{fmtInt(p.limits.users)}</dd>
                    <dt className="text-ink-muted">Armazenamento</dt><dd className="ev-num">{fmtLimitMb(p.limits.storageMb)}</dd>
                    <dt className="text-ink-muted">Exportações/mês</dt><dd className="ev-num">{p.limits.exportsPerMonth ? fmtInt(p.limits.exportsPerMonth) : "sem limite"}</dd>
                    <dt className="text-ink-muted">Vídeo/mês</dt><dd className="ev-num">{fmtInt(p.limits.videoMinutesPerMonth)} min</dd>
                    <dt className="text-ink-muted">IA/mês</dt><dd className="ev-num">{fmtInt(p.limits.aiCreditsPerMonth)} créditos</dd>
                  </dl>
                  <div className="flex flex-wrap gap-1">{p.limits.features.map((f) => <Badge key={f}>{d.features.find((x) => x.value === f)?.label ?? f}</Badge>)}</div>
                  <p className="text-xs text-ink-muted">{fmtInt(p.orgCount)} conta(s) neste plano · ordem {p.sortOrder}{p.providerPriceId ? ` · preço no provedor: ${p.providerPriceId}` : " · sem preço no provedor"}</p>
                  <div className="mt-auto"><Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Editar</Button></div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {editing && q.data && (
        <PlanDialog plan={editing === "new" ? null : editing} features={q.data.features} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void q.reload(); }} />
      )}
    </div>
  );
}

type Form = { id: string; name: string; priceCents: number | null; providerPriceId: string; isActive: boolean; sortOrder: string; limits: Record<Exclude<keyof Limits, "features">, string>; features: string[] };

function PlanDialog({ plan, features, onClose, onSaved }: { plan: Plan | null; features: Data["features"]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => ({
    id: plan?.id ?? "", name: plan?.name ?? "", priceCents: plan?.priceCents ?? null, providerPriceId: plan?.providerPriceId ?? "",
    isActive: plan?.isActive ?? true, sortOrder: String(plan?.sortOrder ?? 0),
    limits: Object.fromEntries(LIMIT_FIELDS.map((l) => [l.key, String(plan?.limits[l.key] ?? 0)])) as Form["limits"],
    features: plan?.limits.features ?? ["vitrine", "exportacao"],
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const allFeatures = [...features, ...f.features.filter((x) => !features.some((y) => y.value === x)).map((x) => ({ value: x, label: x }))];

  const localErrors = () => {
    const e: Record<string, string> = {};
    if (!plan && !/^[a-z0-9][a-z0-9-]{1,30}$/.test(f.id)) e.id = "Use letras minúsculas, números e hífen (2 a 31).";
    if (f.name.trim().length < 2) e.name = "Informe o nome do plano.";
    for (const l of LIMIT_FIELDS) {
      const v = f.limits[l.key];
      if (!/^\d+$/.test(v)) e[`limits.${l.key}`] = "Use um número inteiro, sem sinal.";
    }
    if (!/^-?\d+$/.test(f.sortOrder)) e.sortOrder = "Use um número inteiro.";
    return e;
  };

  const submit = async () => {
    const e = localErrors();
    setErrors(e);
    if (Object.keys(e).length) return;
    const body = {
      name: f.name.trim(), priceCents: f.priceCents, providerPriceId: f.providerPriceId.trim() || null, isActive: f.isActive, sortOrder: Number(f.sortOrder),
      limits: { ...Object.fromEntries(LIMIT_FIELDS.map((l) => [l.key, Number(f.limits[l.key])])), features: f.features },
    };
    setBusy(true);
    try {
      if (plan) await api.patch(`/api/admin/plans/${plan.id}`, body);
      else await api.post("/api/admin/plans", { id: f.id, ...body });
      toast(plan ? "Plano atualizado." : "Plano criado.", "success");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message])));
      }
      toast((err as Error).message, "error");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open size="lg" onClose={onClose} title={plan ? `Editar plano ${plan.name}` : "Novo plano"}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}>Salvar plano</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {!plan && <Input label="Identificador" required value={f.id} error={errors.id} hint="Ex.: profissional-plus (não muda depois)" onChange={(e) => setF({ ...f, id: e.target.value.toLowerCase() })} />}
          <Input label="Nome" required maxLength={40} value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <PriceInput label="Preço mensal" value={f.priceCents} error={errors.priceCents} hint="Vazio = valor a definir" onChange={(v) => setF({ ...f, priceCents: v })} />
          <Input label="Id do preço no provedor" maxLength={120} value={f.providerPriceId} error={errors.providerPriceId} hint="Ex.: price_123 (modo de testes ou produção)" onChange={(e) => setF({ ...f, providerPriceId: e.target.value })} />
          <Input label="Ordem de exibição" inputMode="numeric" value={f.sortOrder} error={errors.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          <div className="flex items-end pb-2"><Checkbox label="Plano ativo (disponível para contratação)" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} /></div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Limites</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {LIMIT_FIELDS.map((l) => (
              <Input key={l.key} label={l.label} inputMode="numeric" value={f.limits[l.key]} hint={l.hint} error={errors[`limits.${l.key}`]}
                onChange={(e) => setF({ ...f, limits: { ...f.limits, [l.key]: e.target.value.trim() } })} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Recursos</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {allFeatures.map((x) => (
              <Checkbox key={x.value} label={x.label} checked={f.features.includes(x.value)}
                onChange={(on) => setF({ ...f, features: on ? [...f.features, x.value] : f.features.filter((y) => y !== x.value) })} />
            ))}
          </div>
          {errors["limits.features"] && <p role="alert" className="mt-1 text-sm text-danger">{errors["limits.features"]}</p>}
        </fieldset>
        {plan && <p className="text-xs text-ink-muted">Mudanças valem na hora para as {plan.orgCount} conta(s) deste plano. Nenhum dado é apagado.</p>}
      </form>
    </Dialog>
  );
}
