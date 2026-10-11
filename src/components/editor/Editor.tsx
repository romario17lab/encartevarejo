"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button, cx, Dialog, ErrorState, Spinner, Tabs, toast } from "@/components/ui";
import { LoadingBlock } from "@/components/app/common";
import { IconBack, IconDownload, IconHistory, IconMenu, IconRedo, IconUndo } from "@/components/app/icons";
import type { CampaignItem, RenderBrand, RenderCampaign } from "@/domain/campaign";
import { FORMAT_IDS, FORMATS, type FormatId } from "@/domain/formats";
import { validateOffer } from "@/domain/offer";
import type { LayoutResult, LayoutWarning } from "@/templates/contract";
import { getTemplate } from "@/templates/registry";
import { computePieceLayout } from "@/render/PieceRenderer";
import { api, ApiError, duplicatedId, type DuplicateResult, type CampaignCore, type EditorState, type Product, type TemplateMeta } from "@/lib/client/api";
import { applyModeToAll, buildRenderCampaign, itemFromProduct, mixedMechanicsWarning, newItemId } from "@/lib/client/campaign";
import { fmtTime } from "@/lib/client/format";
import { useMe } from "@/lib/client/hooks";
import { CampaignPanel } from "./CampaignPanel";
import { VersionsDrawer, WarningsPanel, type WarningEntry } from "./Drawers";
import { ExportDialog } from "./ExportDialog";
import { ItemProperties } from "./ItemProperties";
import { ItemsPanel } from "./ItemsPanel";
import { PiecePanel } from "./PiecePanel";
import { AllFormatsGrid, FormatTabs, PreviewPane } from "./PreviewPane";
import { ProductPicker } from "./ProductPicker";
import { docFromState, docKey, effectiveOverrides, getPiece, moveItem, renumber, useEditorDoc, withPiece, type EditorDoc } from "./state";
import { TemplateGallery, useTemplates } from "./TemplateGallery";
import { clearDraft, readDraft, serializeForPut, useAutosave, type DraftRecord, type SaveStatus } from "./useAutosave";
import { WorkflowBar } from "./WorkflowBar";

type MobileTab = "itens" | "previa" | "peca" | "campanha" | "avisos";
type SideTab = "produto" | "peca" | "campanha" | "avisos";

function useIsDesktop() {
  const [d, setD] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setD(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return d;
}

const FALLBACK_BRAND: RenderBrand = {
  storeName: "", logoUrl: null, colors: { primary: "#C8102E", secondary: "#FFD100", accent: "#007A3D", text: "#1A1A1A", background: "#FFFFFF" },
  phone: null, whatsapp: null, address: null, instagram: null, website: null, hours: null,
};

/** Carrega a campanha e entrega ao editor só quando os dados estão prontos. */
export function EditorLoader({ id, initialTab }: { id: string; initialTab?: string }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [render, setRender] = useState<RenderCampaign | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([
        api.get<EditorState>(`/api/campaigns/${id}`),
        api.get<RenderCampaign>(`/api/campaigns/${id}/render-data`).catch(() => null),
      ]);
      setState(s); setRender(r);
    } catch (e) { setError(e as ApiError); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error) return (
    <div className="mx-auto max-w-md p-6">
      <ErrorState title={error.status === 404 ? "Campanha não encontrada" : "Não foi possível abrir a campanha"} message={error.message} onRetry={error.status === 404 ? undefined : load} />
      <Link href="/app/campanhas" className="mt-4 inline-block font-semibold text-brand underline">Voltar para campanhas</Link>
    </div>
  );
  if (!state) return <div className="flex min-h-dvh items-center justify-center"><LoadingBlock label="Abrindo o editor…" /></div>;
  return <Editor key={state.campaign.id} initial={state} renderData={render} initialTab={initialTab} />;
}

function Editor({ initial, renderData, initialTab }: { initial: EditorState; renderData: RenderCampaign | null; initialTab?: string }) {
  const router = useRouter();
  const { me, can } = useMe();
  const id = initial.campaign.id;
  const isDesktop = useIsDesktop();
  const history = useEditorDoc(docFromState(initial));
  const { doc } = history;
  const [server, setServer] = useState<CampaignCore>(initial.campaign);
  const [tplInfo, setTplInfo] = useState(initial.template);
  const [brand, setBrand] = useState<RenderBrand>(renderData?.brand ?? { ...FALLBACK_BRAND, storeName: initial.store?.name ?? "" });
  const [legalText, setLegalText] = useState<string | null>(renderData?.legalText ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatId>("encarte_a4");
  const [page, setPage] = useState(0);
  const [mobileTab, setMobileTab] = useState<MobileTab>(initialTab === "previa" ? "previa" : "itens");
  const [sideTab, setSideTab] = useState<SideTab>("campanha");
  const [overflow, setOverflow] = useState<LayoutWarning[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [dlg, setDlg] = useState<null | "add" | "template" | "versions" | "export" | "menu" | "item">(null);
  const [addSel, setAddSel] = useState<Product[]>([]);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = !can("campaigns.write");
  const templates = useTemplates();

  const autosave = useAutosave({
    campaignId: id, doc, initialVersion: initial.campaign.version, enabled: !readOnly,
    onSaved: (res, _key, v) => setServer((s) => ({ ...s, ...(res?.campaign ?? {}), version: v })),
    onConflict: () => setConflict(true),
  });

  // rascunho local não salvo (aba fechada antes do salvamento)
  useEffect(() => {
    const d = readDraft(id);
    if (d && docKey(d.doc) !== docKey(docFromState(initial))) setDraft(d); else if (d) clearDraft(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reload = useCallback(async () => {
    const [s, r] = await Promise.all([api.get<EditorState>(`/api/campaigns/${id}`), api.get<RenderCampaign>(`/api/campaigns/${id}/render-data`).catch(() => null)]);
    const d = docFromState(s);
    history.reset(d);
    autosave.markSaved(d, s.campaign.version);
    setServer(s.campaign); setTplInfo(s.template);
    if (r) { setBrand(r.brand); setLegalText(r.legalText); }
    clearDraft(id);
  }, [id, history, autosave]);

  // atalhos de teclado: desfazer/refazer (fora de campos de texto, onde vale o desfazer do próprio campo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); history.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history]);

  // ---------- edição ----------
  const setItems = (items: CampaignItem[], key?: string) => history.set({ ...doc, items: renumber(items) }, key);
  const patchItem = (itemId: string, patch: Partial<CampaignItem>, key?: string) => setItems(doc.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)), key);
  const move = (from: number, to: number) => { if (to < 0 || to >= doc.items.length || from === to) return; history.set({ ...doc, items: moveItem(doc.items, from, to) }); };
  const removeItem = (itemId: string) => {
    const it = doc.items.find((x) => x.id === itemId);
    history.set({ ...doc, items: renumber(doc.items.filter((x) => x.id !== itemId)) });
    setSelectedId(null); if (dlg === "item") setDlg(null);
    toast(`“${it?.name}” removido. Use Desfazer para voltar.`, "info");
  };
  const addProducts = () => {
    const start = doc.items.length;
    setItems([...doc.items, ...addSel.map((p, i) => itemFromProduct(p, start + i))]);
    toast(`${addSel.length} ${addSel.length === 1 ? "produto adicionado" : "produtos adicionados"}.`, "success");
    setAddSel([]); setDlg(null);
  };
  const patchCampaign = (patch: Partial<CampaignCore>, key?: string) => history.set({ ...doc, campaign: { ...doc.campaign, ...patch } }, key);

  // ---------- prévia e avisos ----------
  const template = useMemo(() => getTemplate(tplInfo.id, tplInfo.version), [tplInfo.id, tplInfo.version]);
  const renderCampaign = useMemo(() => buildRenderCampaign({
    id, version: server.version, title: doc.campaign.title, subtitle: doc.campaign.subtitle, startsAt: doc.campaign.startsAt, endsAt: doc.campaign.endsAt,
    validityNote: doc.campaign.validityNote, items: doc.items, brand, legalText,
  }), [id, server.version, doc.campaign, doc.items, brand, legalText]);
  // prévia e layout seguem o estado com prioridade baixa: digitar continua fluido em aparelhos fracos
  const deferredCampaign = useDeferredValue(renderCampaign);
  const deferredDoc = useDeferredValue(doc);
  const layouts = useMemo(() => {
    const out: Partial<Record<FormatId, LayoutResult | null>> = {};
    if (!template) return out;
    for (const f of FORMAT_IDS) {
      if (!getPiece(deferredDoc, f).enabled && f !== format) continue;
      try { out[f] = computePieceLayout(deferredCampaign, template, f, effectiveOverrides(deferredDoc, f)); } catch { out[f] = null; }
    }
    return out;
  }, [deferredCampaign, template, deferredDoc, format]);
  const names = useMemo(() => Object.fromEntries(doc.items.map((i) => [i.id, i.name])), [doc.items]);
  const minMarginBp = me.org.settings?.minMarginBp ?? null;

  const warnings: WarningEntry[] = useMemo(() => {
    const w: WarningEntry[] = [];
    if (!doc.items.some((i) => !i.paused)) w.push({ level: "error", message: "Adicione pelo menos um produto à campanha.", source: "oferta" });
    for (const it of doc.items) {
      if (!it.name.trim()) w.push({ level: "error", message: "Produto sem nome.", itemId: it.id, source: "oferta" });
      for (const iss of validateOffer(it.offer, { unit: it.unit })) w.push({ level: iss.level, message: iss.message, itemId: it.id, source: "oferta" });
    }
    const { startsAt, endsAt } = doc.campaign;
    if (!startsAt || !endsAt) w.push({ level: "error", message: "Informe o período de validade da campanha (aba Campanha).", source: "oferta" });
    else if (new Date(endsAt) <= new Date(startsAt)) w.push({ level: "error", message: "A data final precisa ser depois da data inicial.", source: "oferta" });
    else if (new Date(endsAt) < new Date()) w.push({ level: "error", message: "A validade da campanha já terminou. Ajuste as datas.", source: "oferta" });
    const mixed = mixedMechanicsWarning(doc.items.filter((i) => !i.paused).map((i) => i.offer));
    if (mixed) w.push({ level: "warning", message: mixed, source: "oferta" });
    const seen = new Set<string>();
    for (const f of FORMAT_IDS) {
      if (!getPiece(doc, f).enabled) continue;
      if (template && !template.supportedFormats.includes(f)) { w.push({ level: "warning", message: `O modelo não tem ${FORMATS[f].label}.`, format: f, source: "layout" }); continue; }
      for (const lw of layouts[f]?.warnings ?? []) {
        if (lw.code === "invalid_price") continue; // já coberto pela validação da oferta
        if (lw.code === "missing_image") { // vale para todas as peças: um aviso por produto
          const mk = `img|${lw.itemId}`;
          if (!seen.has(mk)) { seen.add(mk); w.push({ level: "warning", message: `“${names[lw.itemId ?? ""] ?? "Produto"}” está sem foto: o card mostra só o nome e o preço.`, itemId: lw.itemId, source: "layout" }); }
          continue;
        }
        const k = `${f}|${lw.code}|${lw.itemId ?? ""}|${lw.message}`;
        if (seen.has(k)) continue; seen.add(k);
        w.push({ level: lw.code === "overflow" || lw.code === "overlap" ? "error" : "warning", message: `${FORMATS[f].label}: ${lw.message}`, itemId: lw.itemId, format: f, source: "layout" });
      }
    }
    // medição no navegador: aviso (a exportação no servidor verifica de novo e falha se não couber)
    for (const o of overflow) w.push({ level: "warning", message: `${FORMATS[format].label}: ${o.message}`, itemId: o.itemId, format, source: "encaixe" });
    return w;
  }, [doc, layouts, overflow, format, template, names]);
  const hasErrors = warnings.some((w) => w.level === "error");
  const warnPerFormat = useMemo(() => {
    const m: Partial<Record<FormatId, number>> = {};
    for (const w of warnings) if (w.format) m[w.format] = (m[w.format] ?? 0) + 1;
    return m;
  }, [warnings]);

  // ---------- ações de servidor ----------
  const flushOrThrow = async () => { if (!readOnly) await autosave.flush(); };
  const switchTemplate = async (t: TemplateMeta, version?: number) => {
    setBusy(true);
    try {
      await flushOrThrow();
      await api.post(`/api/campaigns/${id}/template`, { templateId: t.id, templateVersion: version });
      await reload();
      toast(version ? `Modelo atualizado para a versão ${version}.` : `Modelo trocado para “${t.name}”.`, "success");
      setDlg(null);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const duplicate = async () => {
    setBusy(true);
    try {
      await flushOrThrow();
      const r = await api.post<DuplicateResult>(`/api/campaigns/${id}/duplicate`, {});
      const nid = duplicatedId(r);
      toast("Campanha duplicada.", "success");
      if (nid) router.push(`/app/campanhas/${nid}`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const resolveReload = async () => { setBusy(true); try { await reload(); setConflict(false); toast("Versão mais recente carregada.", "info"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } };
  const resolveKeepCopy = async () => {
    setBusy(true);
    try {
      const mine = doc;
      const r = await api.post<DuplicateResult>(`/api/campaigns/${id}/duplicate`, { name: `${mine.campaign.name} (minha cópia)` });
      const nid = duplicatedId(r);
      if (!nid) throw new Error("Não foi possível criar a cópia.");
      const copy = await api.get<EditorState>(`/api/campaigns/${nid}`);
      const idMap = new Map(mine.items.map((it) => [it.id, newItemId()]));
      const items = mine.items.map((it) => ({ ...it, id: idMap.get(it.id)! }));
      const pieces = mine.pieces.map((p) => ({ ...p, overrides: { ...p.overrides, hiddenItemIds: p.overrides.hiddenItemIds?.map((x) => idMap.get(x) ?? x) } }));
      await api.put(`/api/campaigns/${nid}`, serializeForPut({ campaign: { ...mine.campaign, name: `${mine.campaign.name} (minha cópia)` }, items, pieces }, copy.campaign.version));
      clearDraft(id);
      toast("Suas alterações foram salvas numa cópia.", "success");
      window.location.assign(`/app/campanhas/${nid}`);
    } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  };

  const selected = doc.items.find((i) => i.id === selectedId) ?? null;
  const selectedIndex = selected ? doc.items.indexOf(selected) : -1;
  const piece = getPiece(doc, format);
  const enabledFormats = FORMAT_IDS.filter((f) => getPiece(doc, f).enabled);
  const supported = !!template?.supportedFormats.includes(format);
  const selectItem = (itemId: string) => { setSelectedId(itemId); if (isDesktop) setSideTab("produto"); else setDlg("item"); };
  const exportBlocked = hasErrors ? "Corrija os erros listados em Avisos (preços, unidades ou encaixe) antes de exportar." : null;

  // ---------- blocos ----------
  const itemsPanel = (
    <ItemsPanel items={doc.items} selectedId={selectedId} onSelect={selectItem} onMove={move} onAdd={() => setDlg("add")} readOnly={readOnly} hiddenIds={piece.overrides.hiddenItemIds} />
  );
  const preview = (height: string) => !template ? (
    <ErrorState title="Modelo indisponível" message={`O modelo ${tplInfo.name || tplInfo.id} (versão ${tplInfo.version}) não está disponível neste aplicativo. Troque o modelo.`} />
  ) : (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><FormatTabs value={format} onChange={(f) => { setFormat(f); setPage(0); setShowAll(false); }} warnings={warnPerFormat} disabledFormats={FORMAT_IDS.filter((f) => !enabledFormats.includes(f))} /></div>
        <button type="button" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)} className={cx("shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold", showAll ? "border-ink bg-ink text-white" : "border-line bg-surface")}>Todas</button>
      </div>
      {showAll ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <AllFormatsGrid campaign={deferredCampaign} template={template} formats={enabledFormats.filter((f) => template.supportedFormats.includes(f))}
            overridesFor={(f) => effectiveOverrides(deferredDoc, f)} layouts={layouts} warnings={warnPerFormat} onPick={(f) => { setFormat(f); setPage(0); setShowAll(false); }} />
        </div>
      ) : !supported ? <p className="rounded-xl bg-warning/10 p-4 text-sm">O modelo “{template.name}” não tem o formato {FORMATS[format].label}.</p> : (
        <PreviewPane campaign={deferredCampaign} onCellClick={selectItem} template={template} format={format} overrides={effectiveOverrides(doc, format)} layout={layouts[format] ?? null}
          pageIndex={page} onPageChange={setPage} onOverflow={setOverflow} names={names} height={height} />
      )}
    </div>
  );
  const piecePanel = <PiecePanel format={format} piece={piece} items={doc.items} baseColors={brand.colors} supported={supported} readOnly={readOnly}
    onChange={(p, key) => history.set(withPiece(doc, format, p), key)} />;
  const campaignPanel = <CampaignPanel campaign={doc.campaign} onChange={patchCampaign} itemCount={doc.items.length}
    onApplyMode={(m) => { history.set({ ...doc, items: applyModeToAll(doc.items, m) }); toast("Mecânica aplicada a todos os produtos. Use Desfazer para voltar.", "info"); }} template={tplInfo} readOnly={readOnly} canWrite={can("campaigns.write")}
    onSwitchTemplate={() => setDlg("template")} onDuplicate={duplicate}
    onMigrate={() => switchTemplate({ id: tplInfo.id, version: tplInfo.latestVersion, name: tplInfo.name }, tplInfo.latestVersion)} />;
  const warningsPanel = <WarningsPanel warnings={warnings} itemNames={names} onSelectItem={selectItem} onSelectFormat={(f) => { setFormat(f); setPage(0); if (!isDesktop) setMobileTab("previa"); }} />;
  const itemProps = selected && (
    <ItemProperties item={selected} index={selectedIndex} total={doc.items.length} readOnly={readOnly} minMarginBp={minMarginBp}
      onChange={(p, key) => patchItem(selected.id, p, key)} onMove={(to) => move(selectedIndex, to)} onRemove={() => removeItem(selected.id)} />
  );
  // aviso de versão nova também a partir de GET /api/templates
  const latestFromApi = templates.list.find((t) => t.id === tplInfo.id)?.version;
  useEffect(() => { if (latestFromApi && latestFromApi > tplInfo.latestVersion) setTplInfo((t) => ({ ...t, latestVersion: latestFromApi })); }, [latestFromApi, tplInfo.latestVersion]);

  const header = (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2 lg:px-4">
        <Link href="/app/campanhas" aria-label="Voltar para campanhas" className="rounded-lg p-2 hover:bg-ink/5"><IconBack size={20} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold lg:text-lg">{doc.campaign.name}</h1>
          <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} onRetry={() => void autosave.save()} readOnly={readOnly} />
        </div>
        {!readOnly && <>
          <button type="button" onClick={history.undo} disabled={!history.canUndo} aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30"><IconUndo size={20} /></button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} aria-label="Refazer (Ctrl+Shift+Z)" title="Refazer (Ctrl+Shift+Z)" className="rounded-lg p-2 hover:bg-ink/5 disabled:opacity-30"><IconRedo size={20} /></button>
        </>}
        <button type="button" onClick={() => setDlg("versions")} aria-label="Histórico de versões" title="Histórico de versões" className="hidden rounded-lg p-2 hover:bg-ink/5 sm:block"><IconHistory size={20} /></button>
        {can("exports.create") && <Button size="sm" icon={<IconDownload size={16} />} onClick={() => setDlg("export")} className="hidden sm:inline-flex">Exportar</Button>}
        <button type="button" onClick={() => setDlg("menu")} aria-label="Mais ações" className="rounded-lg p-2 hover:bg-ink/5 sm:hidden"><IconMenu size={20} /></button>
      </div>
      <div className="border-t border-line px-3 py-2 lg:px-4">
        <WorkflowBar campaign={{ ...server, ...doc.campaign, status: server.status, version: server.version, contentHash: server.contentHash, approvedHash: server.approvedHash, approvedVersion: server.approvedVersion, scheduledPublishAt: server.scheduledPublishAt, publishedVersion: server.publishedVersion ?? null, needsReapproval: server.needsReapproval ?? false }}
          can={can} hasErrors={hasErrors} beforeAction={flushOrThrow} afterAction={reload} />
      </div>
    </header>
  );

  if (isDesktop === null) return <div className="flex min-h-dvh items-center justify-center"><Spinner /></div>;

  return (
    <div className={cx("flex flex-col bg-surface-alt", isDesktop ? "h-dvh overflow-hidden" : "min-h-dvh")}>
      {header}
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)] gap-4 p-4">
          <aside aria-label="Produtos" className="min-h-0 overflow-auto rounded-2xl border border-line bg-surface p-3">{itemsPanel}</aside>
          <section aria-label="Prévia" className="min-h-0">{preview("100%")}</section>
          <aside aria-label="Propriedades" className="flex min-h-0 flex-col rounded-2xl border border-line bg-surface">
            <Tabs value={sideTab} onChange={setSideTab} className="m-3 mb-0" tabs={[
              { value: "produto", label: "Produto" }, { value: "peca", label: "Peça" }, { value: "campanha", label: "Campanha" },
              { value: "avisos", label: "Avisos", badge: warnings.length ? <span className={cx("rounded-full px-1.5 text-[11px] text-white", hasErrors ? "bg-danger" : "bg-warning")}>{warnings.length}</span> : undefined },
            ]} />
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {sideTab === "produto" && (itemProps ?? <p className="text-sm text-ink-muted">Selecione um produto na lista para editar nome, foto e oferta.</p>)}
              {sideTab === "peca" && piecePanel}
              {sideTab === "campanha" && campaignPanel}
              {sideTab === "avisos" && warningsPanel}
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="bg-surface-alt px-3 pt-2">
            <Tabs value={mobileTab} onChange={setMobileTab} tabs={[
              { value: "itens", label: `Produtos (${doc.items.length})` }, { value: "previa", label: "Prévia" }, { value: "peca", label: "Peça" }, { value: "campanha", label: "Campanha" },
              { value: "avisos", label: "Avisos", badge: warnings.length ? <span className={cx("rounded-full px-1.5 text-[11px] text-white", hasErrors ? "bg-danger" : "bg-warning")}>{warnings.length}</span> : undefined },
            ]} />
          </div>
          <div className="flex-1 p-3 pb-24">
            {mobileTab === "itens" && itemsPanel}
            {mobileTab === "previa" && preview("62dvh")}
            {mobileTab === "peca" && <>
              <div className="mb-3"><FormatTabs value={format} onChange={(f) => { setFormat(f); setPage(0); }} warnings={warnPerFormat} disabledFormats={FORMAT_IDS.filter((f) => !enabledFormats.includes(f))} /></div>
              {piecePanel}
            </>}
            {mobileTab === "campanha" && campaignPanel}
            {mobileTab === "avisos" && warningsPanel}
          </div>
          {can("exports.create") && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <Button block icon={<IconDownload size={18} />} onClick={() => setDlg("export")}>Exportar arquivos</Button>
            </div>
          )}
        </div>
      )}

      {/* ---------- diálogos ---------- */}
      <Dialog open={dlg === "item" && !!selected} onClose={() => setDlg(null)} title={selected ? `Editar: ${selected.name}` : "Editar produto"}>
        {itemProps}
      </Dialog>
      <Dialog open={dlg === "add"} onClose={() => { setDlg(null); setAddSel([]); }} title="Adicionar produtos" size="lg"
        footer={<><Button variant="secondary" onClick={() => { setDlg(null); setAddSel([]); }}>Cancelar</Button><Button onClick={addProducts} disabled={!addSel.length}>Adicionar {addSel.length || ""}</Button></>}>
        {dlg === "add" && <ProductPicker selected={addSel} onChange={setAddSel} excludeIds={doc.items.map((i) => i.productId).filter(Boolean) as string[]} />}
      </Dialog>
      <Dialog open={dlg === "template"} onClose={() => setDlg(null)} title="Trocar modelo" size="lg">
        <p className="mb-3 text-sm text-ink-muted">Os produtos, preços e ajustes continuam. Só muda o visual.</p>
        {dlg === "template" && <TemplateGallery value={null} currentId={tplInfo.id} brand={brand} onSelect={(t) => { if (t.id !== tplInfo.id) void switchTemplate(t); }} />}
        {busy && <p role="status" className="mt-2 text-sm">Trocando o modelo…</p>}
      </Dialog>
      <Dialog open={dlg === "menu"} onClose={() => setDlg(null)} title="Ações" size="sm">
        <div className="flex flex-col gap-2">
          <Button variant="secondary" icon={<IconHistory size={18} />} onClick={() => setDlg("versions")}>Histórico de versões</Button>
          {can("campaigns.write") && <Button variant="secondary" onClick={() => { setDlg(null); void duplicate(); }}>Duplicar campanha</Button>}
          {can("campaigns.write") && <Button variant="secondary" onClick={() => setDlg("template")}>Trocar modelo</Button>}
        </div>
      </Dialog>
      <VersionsDrawer open={dlg === "versions"} onClose={() => setDlg(null)} campaignId={id} currentVersion={server.version} canRestore={can("campaigns.write")}
        beforeRestore={flushOrThrow} onRestored={reload} />
      <ExportDialog open={dlg === "export"} onClose={() => setDlg(null)} campaignId={id} campaignName={doc.campaign.name} enabledFormats={enabledFormats.filter((f) => !template || template.supportedFormats.includes(f))}
        beforeExport={flushOrThrow} blockedReason={exportBlocked} />

      <Dialog open={conflict} onClose={() => { /* precisa escolher */ }} title="Outra pessoa alterou esta campanha" size="sm"
        footer={<><Button variant="secondary" loading={busy} onClick={resolveReload}>Recarregar e descartar as minhas</Button><Button loading={busy} onClick={resolveKeepCopy}>Manter as minhas como cópia</Button></>}>
        <p className="text-sm">Enquanto você editava, a campanha foi salva em outro lugar (outra aba ou outra pessoa). Suas alterações ainda não foram salvas.</p>
      </Dialog>
      <Dialog open={!!draft && !conflict} onClose={() => { if (draft) clearDraft(id); setDraft(null); }} title="Recuperar alterações não salvas?" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => { clearDraft(id); setDraft(null); }}>Descartar</Button>
          <Button onClick={() => { if (draft) { history.set(draft.doc); if (draft.baseVersion !== server.version) autosave.baseVersion.current = draft.baseVersion; } setDraft(null); toast("Alterações recuperadas.", "success"); }}>Recuperar</Button>
        </>}>
        <p className="text-sm">Encontramos alterações feitas neste aparelho {draft && `em ${new Date(draft.at).toLocaleString("pt-BR")}`} que não chegaram a ser salvas.</p>
        {draft && draft.baseVersion !== server.version && <p className="mt-2 text-sm text-ink-muted">A campanha mudou desde então. Se recuperar, você poderá escolher entre recarregar ou guardar as suas como cópia.</p>}
      </Dialog>
    </div>
  );
}

function SaveIndicator({ status, savedAt, error, onRetry, readOnly }: { status: SaveStatus; savedAt: Date | null; error: string | null; onRetry: () => void; readOnly: boolean }) {
  if (readOnly) return <p className="text-xs text-ink-muted">Somente leitura</p>;
  return (
    <p className="text-xs" aria-live="polite" role="status">
      {status === "saving" && <span className="text-ink-muted">Salvando…</span>}
      {status === "dirty" && <span className="text-ink-muted">Alterações não salvas</span>}
      {status === "saved" && <span className="text-success">{savedAt ? `Salvo às ${fmtTime(savedAt)}` : "Todas as alterações salvas"}</span>}
      {status === "conflict" && <span className="font-semibold text-danger">Conflito de edição</span>}
      {status === "error" && <span className="text-danger" title={error ?? undefined}>Erro ao salvar — <button className="font-semibold underline" onClick={onRetry}>tentar de novo</button></span>}
    </p>
  );
}
