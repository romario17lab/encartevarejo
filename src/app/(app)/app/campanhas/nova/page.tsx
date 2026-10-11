"use client";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, Input, Select, toast } from "@/components/ui";
import { PageHeader, Thumb } from "@/components/app/common";
import { IconDown, IconTrash, IconUp } from "@/components/app/icons";
import { DefaultMechanic, OfferEditor } from "@/components/editor/OfferEditor";
import { ProductPicker } from "@/components/editor/ProductPicker";
import { TemplateGallery } from "@/components/editor/TemplateGallery";
import { describeOffer, type Offer } from "@/domain/offer";
import type { Unit } from "@/domain/offer";
import { api, assetUrl, type EditorState, type Product, type TemplateMeta } from "@/lib/client/api";
import { applyModeToAll, itemErrors, mixedMechanicsWarning, offerFromProduct, suggestCampaignName } from "@/lib/client/campaign";
import { fromDateInput, toDateInput, UNIT_OPTIONS } from "@/lib/client/format";
import { useMe } from "@/lib/client/hooks";

const STEPS = ["Modelo", "Produtos", "Revisar", "Gerar"];
type Row = { product: Product; offer: Offer; unit: Unit | null; open: boolean };

function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return toDateInput(d.toISOString()); }
// ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD (vindo do calendário) pré-preenche o período
const ymdParam = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? v : null);

export default function QuickWizard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = use(searchParams);
  const qStart = ymdParam(sp.inicio);
  const qEnd = ymdParam(sp.fim);
  const router = useRouter();
  const { me, storeId } = useMe();
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateMeta | null>(null);
  const [selected, setSelected] = useState<Product[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [title, setTitle] = useState("Ofertas da Semana");
  const [start, setStart] = useState(() => qStart ?? addDays(0));
  const [end, setEnd] = useState(() => {
    const s0 = qStart ?? addDays(0);
    if (qEnd && qEnd >= s0) return qEnd;
    return qStart ? toDateInput(new Date(Date.parse(`${qStart}T12:00:00-03:00`) + 6 * 86400000).toISOString()) : addDays(6);
  });
  const [store, setStore] = useState(storeId ?? me.stores[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segment = me.stores.find((s) => s.id === store)?.segment ?? "";

  const goReview = () => {
    // mantém ofertas já editadas; novos produtos recebem a oferta do catálogo
    setRows((prev) => selected.map((p) => prev.find((r) => r.product.id === p.id) ?? { product: p, offer: offerFromProduct(p), unit: p.unit, open: false }));
    if (!nameEdited) setName(suggestCampaignName(start, end));
    setStep(2);
  };
  const errorsCount = useMemo(() => rows.filter((r) => itemErrors({ offer: r.offer, unit: r.unit }).length).length, [rows]);
  const dateError = !start || !end ? "Informe o início e o fim das ofertas." : end < start ? "A data final precisa ser depois da inicial." : null;
  const setDates = (a: string, b: string) => { setStart(a); setEnd(b); if (!nameEdited) setName(suggestCampaignName(a, b)); };
  const mixed = mixedMechanicsWarning(rows.map((r) => r.offer));
  const move = (i: number, d: -1 | 1) => setRows((rs) => { const n = [...rs]; const j = i + d; if (j < 0 || j >= n.length) return rs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const generate = async () => {
    if (!template) return;
    setBusy(true); setError(null); setStep(3);
    try {
      const created = await api.post<{ id?: string; campaign?: { id: string } }>("/api/campaigns", {
        storeId: store, name: name.trim() || title, templateId: template.id,
        startsAt: fromDateInput(start), endsAt: fromDateInput(end, true), productIds: rows.map((r) => r.product.id),
      });
      const id = created.id ?? created.campaign?.id;
      if (!id) throw new Error("A campanha foi criada, mas a resposta veio sem identificador.");
      // aplica as ofertas revisadas, a ordem e o título
      const st = await api.get<EditorState>(`/api/campaigns/${id}`);
      const byProduct = new Map(rows.map((r, i) => [r.product.id, { r, i }]));
      const items = st.items.map((it) => {
        const m = it.productId ? byProduct.get(it.productId) : undefined;
        return m ? { ...it, offer: m.r.offer, unit: m.r.unit, position: m.i } : it;
      });
      await api.put(`/api/campaigns/${id}`, { baseVersion: st.campaign.version, campaign: { ...st.campaign, title }, items, pieces: st.pieces });
      toast("Campanha criada!", "success");
      router.push(`/app/campanhas/${id}?aba=previa`);
    } catch (e) {
      setError((e as Error).message); setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Nova campanha" back={{ href: "/app/campanhas", label: "Campanhas" }} />
      <ol className="mb-5 grid grid-cols-4 gap-1 text-xs sm:text-sm" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full px-2 py-1.5 text-center font-semibold ${i === step ? "bg-brand text-white" : i < step ? "bg-brand-soft text-brand-strong" : "bg-ink/5 text-ink-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <h2 className="mb-3 font-display text-lg font-bold">Escolha um modelo</h2>
          <TemplateGallery value={template?.id ?? null} onSelect={setTemplate} segmentDefault={segment} />
          <StepNav next={{ label: "Continuar", onClick: () => setStep(1), disabled: !template }} hint={template ? `Modelo: ${template.name}` : "Toque em um modelo para escolher."} />
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="mb-3 font-display text-lg font-bold">Adicione os produtos</h2>
          <ProductPicker selected={selected} onChange={setSelected} />
          <StepNav back={() => setStep(0)} next={{ label: "Revisar ofertas", onClick: goReview, disabled: !selected.length }} />
        </>
      )}

      {step === 2 && (
        <>
          <Card className="mb-4 grid gap-3 sm:grid-cols-2">
            <Input label="Título no material" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            <Input label="Nome interno da campanha" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setNameEdited(true); }} hint="Só aparece para a equipe." />
            <Input label="Início das ofertas" type="date" required value={start} onChange={(e) => setDates(e.target.value, end)} />
            <Input label="Fim das ofertas" type="date" required value={end} onChange={(e) => setDates(start, e.target.value)} error={dateError} />
            {me.stores.length > 1 && <Select label="Loja" value={store} onChange={(e) => setStore(e.target.value)} options={me.stores.map((s) => ({ value: s.id, label: s.name }))} />}
          </Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Revise as ofertas ({rows.length})</h2>
            {errorsCount > 0 ? <Badge tone="danger">{errorsCount} com pendência</Badge> : <Badge tone="success">Tudo certo</Badge>}
          </div>
          <div className="mb-3"><DefaultMechanic count={rows.length} onApply={(m) => setRows((rs) => applyModeToAll(rs, m))} /></div>
          {mixed && <p role="note" className="mb-3 rounded-xl border border-warning bg-warning/10 p-3 text-sm">⚠ {mixed}</p>}
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const errs = itemErrors({ offer: r.offer, unit: r.unit });
              const set = (p: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <li key={r.product.id} className={`rounded-2xl border bg-surface p-3 ${errs.length ? "border-danger/50" : "border-line"}`}>
                  <div className="flex items-center gap-3">
                    <Thumb url={r.product.imageUrl ?? assetUrl(r.product.imageAssetId)} alt="" size={44} />
                    <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={r.open} onClick={() => set({ open: !r.open })}>
                      <span className="block truncate font-semibold">{r.product.name}</span>
                      <span className={`block text-sm ${errs.length ? "text-danger" : "text-ink-muted"}`}>{errs.length ? errs[0].message : describeOffer(r.offer, r.unit)}</span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`Subir ${r.product.name}`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30"><IconUp size={18} /></button>
                      <button type="button" aria-label={`Descer ${r.product.name}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30"><IconDown size={18} /></button>
                      <button type="button" aria-label={`Remover ${r.product.name}`} onClick={() => { setRows((rs) => rs.filter((_, j) => j !== i)); setSelected((s) => s.filter((p) => p.id !== r.product.id)); }} className="rounded-lg p-2 text-danger hover:bg-danger/5"><IconTrash size={18} /></button>
                    </div>
                  </div>
                  {r.open && (
                    <div className="mt-3 border-t border-line pt-3">
                      {!r.product.unit && <div className="mb-3 max-w-xs"><Select label="Unidade" value={r.unit ?? ""} onChange={(e) => set({ unit: (e.target.value || null) as Unit | null })} options={UNIT_OPTIONS} /></div>}
                      <OfferEditor offer={r.offer} unit={r.unit} onChange={(o) => set({ offer: o })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <StepNav back={() => setStep(1)} next={{ label: "Gerar campanha", onClick: generate, disabled: !rows.length || !!dateError || !store }}
            hint={errorsCount ? "Você pode gerar agora e corrigir as pendências no editor. Elas bloqueiam a aprovação e a exportação." : undefined} />
        </>
      )}

      {step === 3 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          {error ? (
            <>
              <ErrorState title="Não foi possível gerar a campanha" message={error} />
              <Button variant="secondary" onClick={() => setStep(2)}>Voltar e tentar de novo</Button>
            </>
          ) : (
            <>
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-r-transparent" aria-hidden />
              <p role="status" className="font-semibold">Gerando as peças da campanha…</p>
              <p className="text-sm text-ink-muted">Encarte, posts, story, cartazes, etiquetas, banner e TV.</p>
            </>
          )}
        </Card>
      )}
      {busy && step !== 3 && <span className="sr-only" role="status">Processando…</span>}
    </>
  );
}

function StepNav({ back, next, hint }: { back?: () => void; next: { label: string; onClick: () => void; disabled?: boolean }; hint?: string }) {
  return (
    <div className="sticky bottom-[72px] z-20 -mx-4 mt-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border">
      {hint && <p className="mb-2 text-xs text-ink-muted">{hint}</p>}
      <div className="flex gap-2">
        {back && <Button variant="secondary" onClick={back}>Voltar</Button>}
        <Button className="flex-1 sm:ml-auto sm:flex-none" onClick={next.onClick} disabled={next.disabled}>{next.label}</Button>
      </div>
    </div>
  );
}
