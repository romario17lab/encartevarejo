"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, ErrorState, Tabs, Textarea, toast } from "@/components/ui";
import type { CampaignItem } from "@/domain/campaign";
import { api } from "@/lib/client/api";
import { AiBadge, NotConfigured, ReviewNotice, useAiStatus } from "./shared";

// IA no editor: sugestões de textos (título, subtítulo, descrições, legenda) e organização (destaques,
// categorias, ordem). Nada é aplicado sozinho: o usuário edita/aceita cada sugestão; o desfazer do editor vale.

interface TextsResult {
  requestId: string; title: string; subtitle: string; caption: string;
  descriptions: Array<{ itemId: string; name: string; text: string }>; warnings: string[];
}
type Change =
  | { id: string; type: "highlight"; itemId: string; name: string; value: boolean; reason: string; source: string }
  | { id: string; type: "category"; itemId: string; name: string; value: string; reason: string; source: string }
  | { id: string; type: "order"; value: string[]; reason: string; source: string };
interface OrganizeResult { requestId: string | null; changes: Change[]; notes: string[]; aiConfigured: boolean }

const OPEN_EVENT = "ev:ai-editor-open";

/** Botão para o menu "Ações" do editor. Abre o diálogo de sugestões (montado com <AiEditorMount />). */
export function AiEditorMenuButton({ onOpen }: { onOpen?: () => void }) {
  return (
    <Button variant="secondary" onClick={() => { onOpen?.(); window.dispatchEvent(new Event(OPEN_EVENT)); }}>
      <span aria-hidden="true">✦</span> Sugestões da IA (textos e organização)
    </Button>
  );
}

/** Diálogo de sugestões da IA, aberto pelo AiEditorMenuButton. */
export function AiEditorMount(props: Omit<AiEditorDialogProps, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);
  return <AiEditorDialog {...props} open={open} onClose={() => setOpen(false)} />;
}

export interface AiEditorDialogProps {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  items: CampaignItem[];
  readOnly?: boolean;
  /** salva o que está pendente antes de pedir sugestões (a IA lê a campanha salva) */
  beforeRun?: () => Promise<void>;
  onPatchCampaign: (patch: { title?: string; subtitle?: string | null }) => void;
  onSetItems: (items: CampaignItem[]) => void;
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast("Copiado.", "success"); } catch { toast("Não foi possível copiar. Selecione o texto e copie.", "error"); }
}

export function AiEditorDialog({ open, onClose, campaignId, items, readOnly, beforeRun, onPatchCampaign, onSetItems }: AiEditorDialogProps) {
  const status = useAiStatus();
  const [tab, setTab] = useState<"textos" | "organizar">("textos");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [texts, setTexts] = useState<TextsResult | null>(null);
  const [org, setOrg] = useState<OrganizeResult | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const configured = !!status.data?.configured.llm;

  const runTexts = async () => {
    setBusy(true); setError(null);
    try { await beforeRun?.(); setTexts(await api.post<TextsResult>(`/api/ai/campaigns/${campaignId}/texts`)); void status.reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const runOrganize = async () => {
    setBusy(true); setError(null); setDone(new Set());
    try { await beforeRun?.(); setOrg(await api.post<OrganizeResult>(`/api/ai/campaigns/${campaignId}/organize`)); void status.reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const markReviewed = (requestId: string | null | undefined) => { if (requestId) void api.post(`/api/ai/requests/${requestId}`, { status: "revisada" }).catch(() => {}); };

  const apply = (c: Change) => {
    if (c.type === "order") {
      const pos = new Map(c.value.map((id, i) => [id, i]));
      const sorted = [...items].sort((a, b) => (pos.get(a.id) ?? 9999) - (pos.get(b.id) ?? 9999));
      onSetItems(sorted.map((it, i) => ({ ...it, position: i })));
    } else if (c.type === "highlight") {
      onSetItems(items.map((it) => (it.id === c.itemId ? { ...it, highlight: c.value } : it)));
    } else {
      onSetItems(items.map((it) => (it.id === c.itemId ? { ...it, category: c.value } : it)));
    }
    setDone((d) => new Set(d).add(c.id));
    markReviewed(org?.requestId);
  };
  const ignore = (c: Change) => setDone((d) => new Set(d).add(c.id));
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? "item removido";

  return (
    <Dialog open={open} onClose={onClose} title="Sugestões da IA" size="lg">
      <div className="mb-3 flex items-center gap-2"><AiBadge /><span className="text-sm text-ink-muted">Sugestões com base nos dados da campanha. Preços vêm sempre do que está salvo.</span></div>
      {status.data && !configured && tab === "textos" && <div className="mb-3"><NotConfigured what="Sugestões de textos" manual="Escreva título, subtítulo e legenda normalmente no painel da campanha." /></div>}
      <Tabs value={tab} onChange={(v) => { setTab(v); setError(null); }} tabs={[{ value: "textos", label: "Textos" }, { value: "organizar", label: "Organizar produtos" }]} className="mb-3" />
      {error && <div className="mb-3"><ErrorState message={error} /></div>}

      {tab === "textos" && (
        <div className="flex flex-col gap-3">
          <ReviewNotice>Edite à vontade. Os preços na legenda são inseridos pelo sistema exatamente como estão na campanha; valores que não batem são removidos.</ReviewNotice>
          <Button onClick={runTexts} loading={busy} disabled={busy || !configured || !items.length}>{texts ? "Gerar novas sugestões" : "Gerar sugestões de textos"}</Button>
          {texts && (
            <>
              {texts.warnings.map((w) => <p key={w} className="rounded-xl bg-warning/10 px-3 py-2 text-sm">⚠ {w}</p>)}
              <SuggestionField label="Título" value={texts.title} maxLength={60} readOnly={readOnly}
                onChange={(v) => setTexts({ ...texts, title: v })} onApply={() => { onPatchCampaign({ title: texts.title.trim() }); markReviewed(texts.requestId); toast("Título aplicado. Use Desfazer para voltar.", "success"); }} />
              <SuggestionField label="Subtítulo" value={texts.subtitle} maxLength={80} readOnly={readOnly}
                onChange={(v) => setTexts({ ...texts, subtitle: v })} onApply={() => { onPatchCampaign({ subtitle: texts.subtitle.trim() || null }); markReviewed(texts.requestId); toast("Subtítulo aplicado.", "success"); }} />
              <div>
                <Textarea label="Legenda para WhatsApp/Instagram" value={texts.caption} rows={8} onChange={(e) => setTexts({ ...texts, caption: e.target.value })} />
                <div className="mt-2 flex justify-end"><Button variant="secondary" size="sm" onClick={() => { void copy(texts.caption); markReviewed(texts.requestId); }}>Copiar legenda</Button></div>
              </div>
              {texts.descriptions.length > 0 && (
                <div>
                  <p className="text-sm font-medium">Descrições curtas dos produtos</p>
                  <p className="text-xs text-ink-muted">Use nas redes sociais ou na vitrine. Não alteram os dados do produto.</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {texts.descriptions.map((d) => (
                      <li key={d.itemId} className="flex items-start justify-between gap-2 rounded-xl border border-line p-2 text-sm">
                        <span><strong>{d.name}:</strong> {d.text}</span>
                        <Button variant="ghost" size="sm" onClick={() => void copy(d.text)}>Copiar</Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "organizar" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Destaques pelos maiores descontos (calculados dos preços salvos), produtos agrupados por categoria e categorias para itens sem categoria. Aceite cada mudança separadamente.</p>
          <Button onClick={runOrganize} loading={busy} disabled={busy || readOnly || !items.length}>{org ? "Analisar de novo" : "Sugerir organização"}</Button>
          {org && (
            <>
              {org.notes.map((n) => <p key={n} className="rounded-xl bg-ink/5 px-3 py-2 text-sm">{n}</p>)}
              <ul className="flex flex-col gap-2">
                {org.changes.map((c) => {
                  const handled = done.has(c.id);
                  return (
                    <li key={c.id} className={`rounded-xl border p-3 text-sm ${handled ? "border-line opacity-60" : "border-line"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.type === "highlight" && <span><strong>{c.value ? "Destacar" : "Tirar destaque de"}</strong> {c.name}</span>}
                        {c.type === "category" && <span><strong>Categoria</strong> de {c.name}: “{c.value}”</span>}
                        {c.type === "order" && <span><strong>Reordenar</strong> {c.value.length} produtos</span>}
                        {c.source === "ia" ? <AiBadge>sugestão da IA</AiBadge> : <Badge tone="neutral">{c.source === "catalogo" ? "do catálogo" : "cálculo"}</Badge>}
                      </div>
                      <p className="mt-1 text-ink-muted">{c.reason}</p>
                      {c.type === "order" && (
                        <ol className="mt-1 list-decimal pl-5 text-xs text-ink-muted">{c.value.slice(0, 12).map((id) => <li key={id}>{nameOf(id)}</li>)}{c.value.length > 12 && <li>… e mais {c.value.length - 12}</li>}</ol>
                      )}
                      <div className="mt-2 flex gap-2">
                        {handled ? <span className="text-xs font-semibold">Resolvido</span> : <>
                          <Button size="sm" onClick={() => apply(c)} disabled={readOnly}>Aceitar</Button>
                          <Button size="sm" variant="ghost" onClick={() => ignore(c)}>Ignorar</Button>
                        </>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function SuggestionField({ label, value, onChange, onApply, maxLength, readOnly }: { label: string; value: string; onChange: (v: string) => void; onApply: () => void; maxLength: number; readOnly?: boolean }) {
  const id = `ai-${label}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] sm:flex-1" value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
        <Button variant="secondary" onClick={onApply} disabled={readOnly || !value.trim()}>Usar</Button>
      </div>
    </div>
  );
}
