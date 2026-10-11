"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, ErrorState } from "@/components/ui";
import { Checkbox, LoadingBlock } from "@/components/app/common";
import { api, qs } from "@/lib/client/api";
import { money } from "@/lib/client/format";
import { useApi } from "@/lib/client/hooks";
import { addressText, type StoresOverview } from "./types";

interface PreviewStore {
  storeId: string; storeName: string; sameStore: boolean; storeSlug: string; brandKitName: string | null; sameBrandKit: boolean;
  differences: Array<{ itemId: string; name: string; source: "preco_da_loja" | "catalogo" | "mantido"; currentPriceCents: number | null; newPriceCents: number | null; currentRegularCents: number | null; newRegularCents: number | null }>;
  unchangedCount: number;
  attention: Array<{ itemId: string; name: string; reason: string; message: string; priceCents: number | null }>;
  usesStorePriceCount: number; usesCatalogCount: number;
  contactChanges: Array<{ field: string; from: string | null; to: string | null }>;
}
interface Preview { sourceStoreId: string; sourceStoreName: string | null; itemCount: number; stores: PreviewStore[] }
interface Created { campaigns: Array<{ id: string; storeId: string; storeName: string; name: string }> }

const SOURCE_LABEL = { preco_da_loja: "preço da filial", catalogo: "preço do catálogo", mantido: "mantido" } as const;

/** Duplicar a campanha para filiais com prévia das diferenças (preços, itens sem preço, endereço e contatos). */
export function BranchDuplicateDialog({ open, onClose, campaignId, sourceStoreId, beforeDuplicate }: {
  open: boolean; onClose: () => void; campaignId: string; sourceStoreId: string; beforeDuplicate?: () => Promise<void>;
}) {
  const ov = useApi<StoresOverview>(open ? "/api/stores/overview" : null);
  const [step, setStep] = useState<"choose" | "preview" | "done">("choose");
  const [sel, setSel] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [created, setCreated] = useState<Created["campaigns"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!open) { setStep("choose"); setSel([]); setPreview(null); setCreated([]); setError(null); } }, [open]);

  const targets = (ov.data?.stores ?? []).filter((s) => s.id !== sourceStoreId);
  const source = ov.data?.stores.find((s) => s.id === sourceStoreId);
  const toggle = (id: string, v: boolean) => setSel((cur) => (v ? [...cur, id] : cur.filter((x) => x !== id)));

  const loadPreview = async () => {
    setBusy(true); setError(null);
    try {
      await beforeDuplicate?.();
      setPreview(await api.get<Preview>(`/api/stores/branch-copy${qs({ campaignId, storeIds: sel.join(",") })}`));
      setStep("preview");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post<Created>("/api/stores/branch-copy", { campaignId, storeIds: sel });
      setCreated(r.campaigns ?? []);
      setStep("done");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const attentionTotal = preview?.stores.reduce((n, s) => n + s.attention.length, 0) ?? 0;
  const footer = step === "choose" ? (
    <><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={loadPreview} loading={busy} disabled={!sel.length || ov.data?.plan.branchesFeature === false}>Ver diferenças ({sel.length})</Button></>
  ) : step === "preview" ? (
    <><Button variant="secondary" onClick={() => setStep("choose")}>Voltar</Button><Button onClick={confirm} loading={busy}>Criar {sel.length} rascunho{sel.length > 1 ? "s" : ""}</Button></>
  ) : <Button onClick={onClose}>Concluir</Button>;

  return (
    <Dialog open={open} onClose={onClose} title="Duplicar para filiais" size="lg" footer={footer}>
      {error && <div className="mb-3"><ErrorState title="Não foi possível continuar" message={error} /></div>}
      {step === "choose" && (ov.loading ? <LoadingBlock /> : ov.error ? <ErrorState message={ov.error.message} onRetry={ov.reload} /> : ov.data && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Uma cópia desta campanha é criada para cada filial escolhida, com os preços da filial (ou do catálogo) e os dados de contato dela. Antes de criar, você confere as diferenças.</p>
          {!ov.data.plan.branchesFeature ? (
            <p role="status" className="rounded-xl bg-warning/15 p-3 text-sm">O plano {ov.data.plan.name} não inclui duplicar campanhas entre filiais. Altere o plano da conta para usar. <Link className="font-semibold underline" href="/app/conta">Ver plano</Link></p>
          ) : targets.length === 0 ? (
            <p className="rounded-xl bg-ink/5 p-3 text-sm">Não há outra filial disponível para você. <Link className="font-semibold text-brand underline" href="/app/filiais">Cadastrar ou ver filiais</Link></p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Origem: {source?.name ?? "loja da campanha"}</p>
                <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => setSel(sel.length === targets.length ? [] : targets.map((t) => t.id))}>
                  {sel.length === targets.length ? "Desmarcar todas" : "Marcar todas"}
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {targets.map((s) => (
                  <li key={s.id} className="rounded-xl border border-line p-3">
                    <Checkbox label={s.name} checked={sel.includes(s.id)} onChange={(v) => toggle(s.id, v)}
                      description={[addressText(s.address) || "sem endereço", s.priceOverrides ? `${s.priceOverrides} preço(s) próprio(s)` : "usa preços do catálogo"].join(" · ")} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}

      {step === "preview" && preview && (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-brand-soft p-3 text-sm">
            As cópias serão criadas como <strong>rascunho</strong>. Cada filial passa pelo fluxo normal: revisão e aprovação das diferenças antes de publicar.
            {attentionTotal > 0 && <> Há <strong>{attentionTotal} item(ns)</strong> que precisam de atenção.</>}
          </p>
          {preview.stores.map((s) => (
            <section key={s.storeId} className="rounded-2xl border border-line p-3" aria-label={`Diferenças para ${s.storeName}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display font-bold">{s.storeName}</h3>
                {s.attention.length > 0 ? <Badge tone="warning">{s.attention.length} para conferir</Badge> : <Badge tone="success">Sem pendências de preço</Badge>}
                {!s.sameBrandKit && <Badge tone="accent">Identidade: {s.brandKitName}</Badge>}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {s.differences.length} preço(s) mudam · {s.unchangedCount} sem mudança · {s.usesStorePriceCount} com preço da filial · {s.usesCatalogCount} com preço do catálogo
              </p>
              {s.attention.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold">Precisam de atenção</h4>
                  <ul className="mt-1 flex flex-col gap-1">
                    {s.attention.map((a) => (
                      <li key={a.itemId} className="rounded-lg border border-warning bg-warning/10 p-2 text-sm">
                        <span className="font-semibold">{a.name}</span>{a.priceCents != null && <> ({money(a.priceCents)})</>}: {a.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.differences.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold">Preços que mudam</h4>
                  <ul className="mt-1 divide-y divide-line text-sm">
                    {s.differences.map((d) => (
                      <li key={d.itemId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                        <span className="min-w-0 flex-1">{d.name} <span className="text-xs text-ink-muted">({SOURCE_LABEL[d.source]})</span></span>
                        <span className="ev-num whitespace-nowrap">
                          <span className="text-ink-muted line-through">{money(d.currentPriceCents)}</span> → <strong>{money(d.newPriceCents)}</strong>
                          {d.newRegularCents != null && d.newRegularCents !== d.currentRegularCents && <span className="text-xs text-ink-muted"> (de {money(d.newRegularCents)})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.contactChanges.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold">Dados da loja nas peças</h4>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {s.contactChanges.map((c) => (
                      <div key={c.field} className="contents">
                        <dt className="capitalize text-ink-muted">{c.field}</dt>
                        <dd className="min-w-0 break-words">{c.to ?? <span className="text-ink-muted">não cadastrado nesta filial</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-3">
          <p role="status" className="rounded-xl bg-success/10 p-3 text-sm">
            {created.length} rascunho{created.length > 1 ? "s" : ""} criado{created.length > 1 ? "s" : ""}. Abra cada um, confira os itens sinalizados e envie para aprovação. Nada foi publicado.
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {created.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 truncate"><strong>{c.storeName}</strong> · {c.name}</span>
                <Link href={`/app/campanhas/${c.id}`} className="shrink-0 font-semibold text-brand underline">Abrir</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
