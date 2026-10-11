"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { api } from "@/lib/client/api";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";
import { AiBadge, CreditsMeter, NotConfigured, ReviewNotice, type AiStatus } from "./shared";

// /app/ia — sugestões de campanhas (calendário + catálogo) e consumo de IA da conta.

interface Idea {
  theme: string; eventName: string | null; startDate: string; endDate: string; categories: string[]; rationale: string;
  products: Array<{ id: string; name: string; sizeLabel: string | null; category: string | null; hasPrice: boolean }>;
}
interface IdeasResult { requestId: string; from: string; to: string; ideas: Idea[] }
interface RequestRow {
  id: string; kind: string; kindLabel: string; status: string; provider: string; model: string | null; credits: number;
  error: string | null; createdAt: string; createdByName: string | null;
}
type History = AiStatus & { requests: RequestRow[] };

const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "brand" }> = {
  processando: { label: "Processando", tone: "brand" }, concluida: { label: "Aguardando revisão", tone: "warning" },
  revisada: { label: "Revisada", tone: "success" }, descartada: { label: "Descartada", tone: "neutral" }, falhou: { label: "Falhou", tone: "danger" },
};
const ymdToIso = (d: string) => `${d}T12:00:00-03:00`;

export function AiHome() {
  const { can } = useMe();
  const hist = useApi<History>("/api/ai/requests?limit=50");
  const s = hist.data;
  return (
    <>
      <PageHeader title="IA assistida" description="Sugestões para acelerar o trabalho. Tudo passa pela sua revisão; preços e dados vêm sempre do seu catálogo e das suas campanhas." />
      {hist.loading && !s && <LoadingBlock />}
      {hist.error && <ErrorState message={hist.error.message} onRetry={hist.reload} />}
      {s && (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-bold">Consumo</h2><span className="text-sm text-ink-muted">Plano {s.credits.planName}</span></div>
            <CreditsMeter status={s} className="mt-3" />
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2">Textos, listas e campanhas {s.configured.llm ? <Badge tone="success">Configurado</Badge> : <Badge tone="neutral">Não configurado</Badge>}</li>
              <li className="flex items-center justify-between gap-2 rounded-xl bg-ink/5 px-3 py-2">Remoção de fundo {s.configured.backgroundRemoval ? <Badge tone="success">Configurado</Badge> : <Badge tone="neutral">Não configurado</Badge>}</li>
            </ul>
            <p className="mt-2 text-xs text-ink-muted">Cada pedido consome créditos do mês (lista em texto: {s.credits.perRequest.extrair_lista_texto}; foto: {s.credits.perRequest.extrair_lista_imagem}; PDF: {s.credits.perRequest.extrair_lista_pdf}; fundo: {s.credits.perRequest.remover_fundo}; textos: {s.credits.perRequest.sugerir_textos}; campanhas: {s.credits.perRequest.sugerir_campanha}; categorias: {s.credits.perRequest.organizar_produtos}). Pedidos que falham não consomem créditos.</p>
          </Card>

          {can("campaigns.write") && <IdeasCard status={s} onUsed={hist.reload} />}

          <Card>
            <h2 className="font-display text-lg font-bold">Histórico de pedidos</h2>
            {s.requests.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Nenhum pedido à IA ainda.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {s.requests.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.kindLabel}</p>
                      <p className="text-xs text-ink-muted">{fmtDateTime(r.createdAt)}{r.createdByName ? ` · ${r.createdByName}` : ""} · {r.provider}{r.model ? ` (${r.model})` : ""}</p>
                      {r.error && <p className="text-xs text-danger">{r.error}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                      <span className="tabular-nums text-xs">{r.credits} {r.credits === 1 ? "crédito" : "créditos"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function IdeasCard({ status, onUsed }: { status: AiStatus; onUsed: () => void }) {
  const router = useRouter();
  const { me, storeId } = useMe();
  const [days, setDays] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<IdeasResult | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try { setRes(await api.post<IdeasResult>("/api/ai/campaign-ideas", { days: Number(days) })); onUsed(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-bold">Sugestões de campanhas</h2><AiBadge /></div>
      <p className="mt-1 text-sm text-ink-muted">Ideias a partir do calendário comercial e do seu catálogo. A IA não sugere preços: o rascunho usa os preços do catálogo e você revisa tudo no editor.</p>
      {!status.configured.llm ? (
        <div className="mt-3"><NotConfigured what="Sugestões de campanhas" manual={<>Veja as datas no <Link href="/app/calendario" className="underline">calendário</Link> e crie a campanha em <Link href="/app/campanhas/nova" className="underline">Nova campanha</Link>.</>} /></div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Select label="Período" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "30", label: "Próximos 30 dias" }, { value: "60", label: "Próximos 60 dias" }, { value: "90", label: "Próximos 90 dias" }]} />
          <Button onClick={run} loading={busy}>Sugerir campanhas</Button>
        </div>
      )}
      {error && <div className="mt-3"><ErrorState message={error} /></div>}
      {res && (
        <div className="mt-4 flex flex-col gap-3">
          <ReviewNotice>Confira datas e produtos. O rascunho é criado sem aprovação e não é publicado.</ReviewNotice>
          {res.ideas.length === 0 && <EmptyState title="Nenhuma ideia aproveitável" description="Tente outro período ou cadastre mais produtos com categoria." />}
          {res.ideas.map((idea, i) => (
            <IdeaItem key={i} idea={idea} requestId={res.requestId} stores={me.stores} defaultStoreId={storeId ?? me.stores[0]?.id ?? ""}
              onCreated={(id) => { toast("Rascunho criado. Revise preços e produtos no editor.", "success"); router.push(`/app/campanhas/${id}`); }} />
          ))}
        </div>
      )}
    </Card>
  );
}

function IdeaItem({ idea, requestId, stores, defaultStoreId, onCreated }: {
  idea: Idea; requestId: string; stores: Array<{ id: string; name: string }>; defaultStoreId: string; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState(idea.theme);
  const [start, setStart] = useState(idea.startDate);
  const [end, setEnd] = useState(idea.endDate);
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [sel, setSel] = useState<Set<string>>(new Set(idea.products.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ campaignId: string }>("/api/ai/campaign-ideas/draft", { requestId, storeId, name, startDate: start, endDate: end, productIds: [...sel] });
      onCreated(r.campaignId);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{idea.theme}</p>
        {idea.eventName && <Badge tone="brand">{idea.eventName}</Badge>}
      </div>
      <p className="text-sm text-ink-muted">{fmtDate(ymdToIso(idea.startDate))} a {fmtDate(ymdToIso(idea.endDate))}{idea.categories.length ? ` · ${idea.categories.join(", ")}` : ""}</p>
      {idea.rationale && <p className="mt-1 text-sm">{idea.rationale}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold">Produtos do catálogo ({sel.size} de {idea.products.length})</summary>
        {idea.products.length === 0 ? <p className="mt-1 text-sm text-ink-muted">Nenhum produto do catálogo combina. O rascunho será criado vazio.</p> : (
          <ul className="mt-2 flex flex-col gap-1">
            {idea.products.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={sel.has(p.id)}
                    onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                  <span className="min-w-0 flex-1">{p.name}{p.sizeLabel ? ` ${p.sizeLabel}` : ""}</span>
                  {!p.hasPrice && <Badge tone="warning">sem preço</Badge>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </details>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Input label="Nome da campanha" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        {stores.length > 1 && <Select label="Loja" value={storeId} onChange={(e) => setStoreId(e.target.value)} options={stores.map((s) => ({ value: s.id, label: s.name }))} />}
        <Input label="Início" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input label="Fim" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="mt-3 flex justify-end"><Button onClick={create} loading={busy} disabled={!name.trim() || !storeId || !start || !end}>Criar rascunho</Button></div>
    </div>
  );
}
