"use client";
// Estado do editor com histórico (desfazer/refazer) e utilidades de itens.
import { useCallback, useReducer } from "react";
import type { CampaignItem, PieceOverrides } from "@/domain/campaign";
import type { FormatId } from "@/domain/formats";
import type { CampaignCore, EditorState, Piece } from "@/lib/client/api";

export interface EditorDoc {
  campaign: CampaignCore;
  items: CampaignItem[];
  pieces: Piece[];
}

interface History { past: EditorDoc[]; present: EditorDoc; future: EditorDoc[]; lastKey: string | null; lastAt: number }
type Action =
  | { type: "set"; doc: EditorDoc; key?: string }
  | { type: "reset"; doc: EditorDoc }
  | { type: "replaceSilently"; doc: EditorDoc }
  | { type: "undo" } | { type: "redo" };

const LIMIT = 100;
function reducer(h: History, a: Action): History {
  switch (a.type) {
    case "reset": return { past: [], present: a.doc, future: [], lastKey: null, lastAt: 0 };
    case "replaceSilently": return { ...h, present: a.doc };
    case "set": {
      if (a.doc === h.present) return h;
      const now = Date.now();
      // digitação contínua no mesmo campo vira UMA entrada no histórico
      if (a.key && a.key === h.lastKey && now - h.lastAt < 1200) return { ...h, present: a.doc, future: [], lastAt: now };
      return { past: [...h.past, h.present].slice(-LIMIT), present: a.doc, future: [], lastKey: a.key ?? null, lastAt: now };
    }
    case "undo": {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
    }
    case "redo": {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
    }
  }
}

export function useEditorDoc(initial: EditorDoc) {
  const [h, dispatch] = useReducer(reducer, { past: [], present: initial, future: [], lastKey: null, lastAt: 0 });
  return {
    doc: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    set: useCallback((doc: EditorDoc, key?: string) => dispatch({ type: "set", doc, key }), []),
    reset: useCallback((doc: EditorDoc) => dispatch({ type: "reset", doc }), []),
    replaceSilently: useCallback((doc: EditorDoc) => dispatch({ type: "replaceSilently", doc }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
  };
}

export const docFromState = (s: EditorState): EditorDoc => ({
  campaign: { ...s.campaign, overrides: s.campaign.overrides ?? {} },
  items: [...s.items].sort((a, b) => a.position - b.position),
  pieces: s.pieces ?? [],
});

/** Só o conteúdo que vai para o servidor (comparação de mudanças). */
export const docKey = (d: EditorDoc) => JSON.stringify({
  c: { name: d.campaign.name, title: d.campaign.title, subtitle: d.campaign.subtitle, startsAt: d.campaign.startsAt, endsAt: d.campaign.endsAt, validityNote: d.campaign.validityNote, overrides: d.campaign.overrides },
  i: d.items, p: d.pieces,
});

export const renumber = (items: CampaignItem[]) => items.map((it, i) => (it.position === i ? it : { ...it, position: i }));

export function moveItem(items: CampaignItem[], from: number, to: number) {
  const n = [...items];
  const [x] = n.splice(from, 1);
  n.splice(Math.max(0, Math.min(n.length, to)), 0, x);
  return renumber(n);
}

export function getPiece(doc: EditorDoc, f: FormatId): Piece {
  return doc.pieces.find((p) => p.format === f) ?? { format: f, enabled: true, overrides: {} };
}
export function withPiece(doc: EditorDoc, f: FormatId, patch: Partial<Piece>): EditorDoc {
  const cur = getPiece(doc, f);
  const next = { ...cur, ...patch };
  const exists = doc.pieces.some((p) => p.format === f);
  return { ...doc, pieces: exists ? doc.pieces.map((p) => (p.format === f ? next : p)) : [...doc.pieces, next] };
}

/** Mesma regra do servidor (effectiveOverrides): campanha + formato; cores mescladas. */
export function effectiveOverrides(doc: EditorDoc, f: FormatId): PieceOverrides {
  const piece = getPiece(doc, f);
  const c = doc.campaign.overrides ?? {};
  const merged: PieceOverrides = { ...c, ...piece.overrides };
  if (c.colors || piece.overrides.colors) merged.colors = { ...c.colors, ...piece.overrides.colors };
  return merged;
}

export { newItemId } from "@/lib/client/campaign";
