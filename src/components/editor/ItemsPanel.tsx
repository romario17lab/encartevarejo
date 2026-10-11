"use client";
import { useState } from "react";
import { Badge, Button, cx } from "@/components/ui";
import { Thumb } from "@/components/app/common";
import { IconDown, IconGrip, IconPlus, IconUp } from "@/components/app/icons";
import { describeOffer } from "@/domain/offer";
import type { CampaignItem } from "@/domain/campaign";
import { assetUrl } from "@/lib/client/api";
import { itemErrors } from "@/lib/client/campaign";

export function ItemsPanel({ items, selectedId, onSelect, onMove, onAdd, readOnly, hiddenIds }: {
  items: CampaignItem[]; selectedId: string | null; onSelect: (id: string) => void; onMove: (from: number, to: number) => void;
  onAdd: () => void; readOnly?: boolean; hiddenIds?: string[];
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <h2 className="font-display font-bold">Produtos <span className="text-ink-muted">({items.length})</span></h2>
        {!readOnly && <Button size="sm" variant="secondary" icon={<IconPlus size={16} />} onClick={onAdd}>Adicionar</Button>}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          Nenhum produto na campanha.{!readOnly && <> <button className="font-semibold text-brand underline" onClick={onAdd}>Adicionar produtos</button></>}
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5 overflow-auto" aria-label="Produtos da campanha, em ordem">
          {items.map((it, i) => {
            const errs = itemErrors(it);
            const sel = it.id === selectedId;
            return (
              <li key={it.id}
                draggable={!readOnly}
                onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) onMove(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                className={cx("group flex items-center gap-2 rounded-xl border bg-surface p-2", sel ? "border-brand ring-2 ring-brand/20" : "border-line",
                  dragOver === i && "border-t-4 border-t-accent", it.paused && "opacity-60")}>
                {!readOnly && <span className="hidden cursor-grab text-ink-muted lg:block" title="Arraste para reordenar" aria-hidden><IconGrip size={16} /></span>}
                <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-muted">{i + 1}</span>
                <button type="button" onClick={() => onSelect(it.id)} aria-current={sel || undefined} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Thumb url={assetUrl(it.imageAssetId)} alt="" size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{it.name}</span>
                    <span className={cx("block truncate text-xs", errs.length ? "font-semibold text-danger" : "text-ink-muted")}>{errs.length ? errs[0].message : describeOffer(it.offer, it.unit)}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {it.highlight && <Badge tone="accent">Destaque</Badge>}
                      {it.paused && <Badge>Pausado</Badge>}
                      {hiddenIds?.includes(it.id) && <Badge>Oculto neste formato</Badge>}
                      {!it.imageAssetId && <Badge tone="warning">Sem foto</Badge>}
                    </span>
                  </span>
                </button>
                {!readOnly && (
                  <span className="flex shrink-0 flex-col">
                    <button type="button" aria-label={`Subir ${it.name}`} disabled={i === 0} onClick={() => onMove(i, i - 1)} className="rounded-md p-1.5 hover:bg-ink/5 disabled:opacity-25"><IconUp size={16} /></button>
                    <button type="button" aria-label={`Descer ${it.name}`} disabled={i === items.length - 1} onClick={() => onMove(i, i + 1)} className="rounded-md p-1.5 hover:bg-ink/5 disabled:opacity-25"><IconDown size={16} /></button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
