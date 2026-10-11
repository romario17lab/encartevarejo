"use client";
// Gestão: telas de TV por loja, status online, criação e pareamento.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { useApi } from "@/lib/client/hooks";
import { api, ApiError } from "@/lib/client/api";
import { PairingCode } from "./TvDevicePanel";
import { screenStatus, type TvScreensResponse, type TvScreenView } from "./types";

export function TvManager() {
  const q = useApi<TvScreensResponse>("/api/tv/screens");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<TvScreenView | null>(null);
  const data = q.data;
  // status online atualizado sem recarregar a página
  useEffect(() => { const t = setInterval(() => void q.reload(), 60_000); return () => clearInterval(t); }, [q.reload]);

  const byStore = new Map<string, TvScreenView[]>();
  for (const s of data?.screens ?? []) byStore.set(s.storeName ?? "Loja", [...(byStore.get(s.storeName ?? "Loja") ?? []), s]);
  const canCreate = !!data?.canWrite && !!data.feature.included && data.stores.length > 0;

  return (
    <>
      <PageHeader title="TV da loja" description="Mostre as ofertas publicadas nas TVs da loja. A TV atualiza sozinha e continua tocando se a internet cair."
        actions={canCreate ? <Button onClick={() => setCreating(true)}>Nova tela</Button> : undefined} />
      {q.loading && !data ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : data && (
        <>
          {!data.feature.included && (
            <div role="status" className="mb-4 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
              <p className="font-semibold">{data.feature.message}</p>
              <Link href="/app/conta/plano" className="mt-1 inline-block font-semibold text-brand underline">Ver planos</Link>
            </div>
          )}
          {data.screens.length === 0 ? (
            <EmptyState title="Nenhuma tela cadastrada" description="Cadastre uma tela, abra /tv no navegador da TV e digite o código de pareamento."
              action={canCreate ? <Button onClick={() => setCreating(true)}>Cadastrar a primeira tela</Button> : undefined} />
          ) : (
            [...byStore.entries()].map(([store, screens]) => (
              <section key={store} className="mb-6">
                <h2 className="mb-2 font-display text-lg font-bold">{store}</h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {screens.map((s) => {
                    const st = screenStatus(s);
                    return (
                      <li key={s.id}>
                        <Card className="flex h-full flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate font-display text-lg font-bold">{s.name}</h3>
                              <p className="text-sm text-ink-muted">
                                {s.orientation === "vertical" ? "Vertical" : "Horizontal"} · {s.slideSeconds} s por slide · {s.itemCount} ite{s.itemCount === 1 ? "m" : "ns"} na programação
                              </p>
                            </div>
                            <span className="shrink-0"><Badge tone={st.tone}>{s.online && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />}{st.label}</Badge></span>
                          </div>
                          {s.pairingCode && s.pairingExpiresAt && <PairingCode code={s.pairingCode} expiresAt={s.pairingExpiresAt} />}
                          <div className="mt-auto flex flex-wrap gap-2">
                            <Link href={`/app/tv/${s.id}`} className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong">
                              {data.canWrite ? "Programação e aparelho" : "Ver programação"}
                            </Link>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
          {creating && (
            <CreateScreenDialog stores={data.stores} onClose={() => setCreating(false)}
              onCreated={(s) => { setCreating(false); setCreated(s); void q.reload(); }} />
          )}
          {created && (
            <Dialog open title="Tela criada: conecte a TV" onClose={() => setCreated(null)}
              footer={<Link href={`/app/tv/${created.id}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white">Montar a programação</Link>}>
              <div className="flex flex-col gap-3">
                {created.pairingCode && created.pairingExpiresAt && <PairingCode code={created.pairingCode} expiresAt={created.pairingExpiresAt} />}
                <p className="text-sm">Na TV, abra <b>{typeof window !== "undefined" ? window.location.origin : ""}/tv</b> e digite o código. TV sem teclado? Gere o <b>link do player</b> na página da tela.</p>
              </div>
            </Dialog>
          )}
        </>
      )}
    </>
  );
}

function CreateScreenDialog({ stores, onClose, onCreated }: { stores: Array<{ id: string; name: string }>; onClose: () => void; onCreated: (s: TvScreenView) => void }) {
  const [name, setName] = useState("TV do caixa");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [seconds, setSeconds] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ screen: TvScreenView }>("/api/tv/screens", { name, storeId, orientation, slideSeconds: Number(seconds) || 10 });
      toast("Tela criada.", "success");
      onCreated(r.screen);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Não foi possível criar a tela."); } finally { setBusy(false); }
  };
  return (
    <Dialog open title="Nova tela de TV" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}>Criar e gerar código</Button></>}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Input label="Nome da tela" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required hint="Ex.: TV do açougue, TV da entrada" />
        <Select label="Loja" value={storeId} onChange={(e) => setStoreId(e.target.value)} options={stores.map((s) => ({ value: s.id, label: s.name }))} />
        <Select label="Posição da TV" value={orientation} onChange={(e) => setOrientation(e.target.value as "horizontal" | "vertical")}
          options={[{ value: "horizontal", label: "Horizontal (1920×1080)" }, { value: "vertical", label: "Vertical (1080×1920)" }]} />
        <Input label="Segundos por slide" type="number" inputMode="numeric" min={4} max={120} value={seconds} onChange={(e) => setSeconds(e.target.value)} hint="Cada página da campanha fica na tela por este tempo (4 a 120 s)." />
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </form>
    </Dialog>
  );
}
