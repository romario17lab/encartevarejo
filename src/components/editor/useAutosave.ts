"use client";
// Salvamento automático com atraso (~1,5 s), controle de versão (baseVersion → 409) e rascunho local.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type EditorState } from "@/lib/client/api";
import { safeStorage } from "@/lib/client/hooks";
import { docKey, type EditorDoc } from "./state";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
export interface DraftRecord { baseVersion: number; doc: EditorDoc; at: string }

export const draftKey = (id: string) => `ev.draft.${id}`;
export function readDraft(id: string): DraftRecord | null {
  try { const raw = safeStorage()?.getItem(draftKey(id)); return raw ? (JSON.parse(raw) as DraftRecord) : null; } catch { return null; }
}
export function clearDraft(id: string) { try { safeStorage()?.removeItem(draftKey(id)); } catch { /* sem armazenamento local */ } }

export function serializeForPut(doc: EditorDoc, baseVersion: number) {
  const c = doc.campaign;
  return {
    baseVersion,
    campaign: { name: c.name, title: c.title, subtitle: c.subtitle, startsAt: c.startsAt, endsAt: c.endsAt, validityNote: c.validityNote, overrides: c.overrides ?? {} },
    items: doc.items.map((it, i) => ({ ...it, position: i })),
    pieces: doc.pieces,
  };
}

const versionOf = (res: unknown): number | null => {
  if (!res || typeof res !== "object") return null;
  const r = res as { version?: number; campaign?: { version?: number } };
  return r.campaign?.version ?? r.version ?? null;
};

export function useAutosave(opts: {
  campaignId: string; doc: EditorDoc; initialVersion: number; enabled: boolean; delayMs?: number;
  onSaved?: (res: EditorState | null, sentKey: string, newVersion: number) => void; onConflict?: () => void;
}) {
  const { campaignId, doc, enabled, delayMs = 1500 } = opts;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseVersion = useRef(opts.initialVersion);
  const savedKey = useRef(docKey(doc));
  const docRef = useRef(doc);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const cbs = useRef({ onSaved: opts.onSaved, onConflict: opts.onConflict });
  cbs.current = { onSaved: opts.onSaved, onConflict: opts.onConflict };
  docRef.current = doc;

  const save = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (blocked.current) return;
    if (inflight.current) { await inflight.current; return save(); }
    const sending = docRef.current;
    const key = docKey(sending);
    if (key === savedKey.current) { setStatus("saved"); return; }
    setStatus("saving"); setError(null);
    const p = (async () => {
      try {
        const res = await api.put<EditorState | { version: number }>(`/api/campaigns/${campaignId}`, serializeForPut(sending, baseVersion.current));
        const v = versionOf(res);
        if (v != null) baseVersion.current = v;
        savedKey.current = key;
        setSavedAt(new Date());
        cbs.current.onSaved?.(res && "campaign" in res ? (res as EditorState) : null, key, baseVersion.current);
        if (docKey(docRef.current) === savedKey.current) { setStatus("saved"); clearDraft(campaignId); }
        else setStatus("dirty");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) { blocked.current = true; setStatus("conflict"); cbs.current.onConflict?.(); }
        else { setStatus("error"); setError((e as Error).message); }
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
    // mudanças feitas durante o envio
    if (!blocked.current && docKey(docRef.current) !== savedKey.current && !timer.current) timer.current = setTimeout(() => void save(), delayMs);
  }, [campaignId, delayMs]);

  useEffect(() => {
    if (!enabled) return;
    const key = docKey(doc);
    if (key === savedKey.current) return;
    setStatus((s) => (s === "conflict" ? s : "dirty"));
    try { safeStorage()?.setItem(draftKey(campaignId), JSON.stringify({ baseVersion: baseVersion.current, doc, at: new Date().toISOString() } satisfies DraftRecord)); } catch { /* cota cheia */ }
    if (blocked.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), delayMs);
  }, [doc, enabled, campaignId, delayMs, save]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (docKey(docRef.current) !== savedKey.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("beforeunload", onUnload); if (timer.current) clearTimeout(timer.current); };
  }, []);

  /** Considera `doc` como a versão salva (após recarregar do servidor). */
  const markSaved = useCallback((d: EditorDoc, version: number) => {
    savedKey.current = docKey(d); baseVersion.current = version; blocked.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setStatus("saved"); setError(null);
  }, []);

  /** Salva agora e espera (antes de ações de fluxo, exportação, troca de modelo). Lança erro se não salvar. */
  const flush = useCallback(async () => {
    await save();
    if (blocked.current) throw new Error("Há um conflito de edição. Resolva antes de continuar.");
    if (docKey(docRef.current) !== savedKey.current) throw new Error("Não foi possível salvar as alterações. Tente de novo.");
  }, [save]);

  return { status, savedAt, error, save, flush, markSaved, baseVersion };
}
