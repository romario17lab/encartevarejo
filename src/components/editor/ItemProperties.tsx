"use client";
import { useEffect, useState } from "react";
import { Button, Dialog, ErrorState, Input, Select } from "@/components/ui";
import { Checkbox, ImageUpload, LoadingBlock, Thumb } from "@/components/app/common";
import { IconImage, IconTrash } from "@/components/app/icons";
import type { CampaignItem } from "@/domain/campaign";
import type { Unit } from "@/domain/offer";
import { assetUrl, type Product } from "@/lib/client/api";
import { UNIT_OPTIONS } from "@/lib/client/format";
import { fetchAllProducts, normalizeName } from "@/lib/client/products";
import { OfferEditor } from "./OfferEditor";

export function ItemProperties({ item, index, total, onChange, onMove, onRemove, readOnly, minMarginBp }: {
  item: CampaignItem; index: number; total: number; onChange: (patch: Partial<CampaignItem>, key?: string) => void;
  onMove: (to: number) => void; onRemove: () => void; readOnly?: boolean; minMarginBp?: number | null;
}) {
  const [pos, setPos] = useState(String(index + 1));
  const [picker, setPicker] = useState(false);
  useEffect(() => setPos(String(index + 1)), [index]);
  const txt = (k: "name" | "brand" | "sizeLabel" | "category") => ({
    value: item[k] ?? "",
    onChange: (e: { target: { value: string } }) => onChange({ [k]: k === "name" ? e.target.value : e.target.value || null }, `${item.id}.${k}`),
  });
  const fit = item.imageFit ?? { x: 50, y: 50, zoom: 1 };
  const setFit = (p: Partial<typeof fit>) => onChange({ imageFit: { ...fit, ...p } }, `${item.id}.fit`);
  const posN = parseInt(pos, 10);

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      <legend className="sr-only">Propriedades de {item.name}</legend>
      <Input label="Nome no material" required maxLength={120} {...txt("name")} error={!item.name.trim() ? "O nome não pode ficar vazio." : null} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Marca" maxLength={60} {...txt("brand")} />
        <Input label="Tamanho" maxLength={40} {...txt("sizeLabel")} placeholder="Ex.: 1kg" />
        <Select label="Unidade" value={item.unit ?? ""} onChange={(e) => onChange({ unit: (e.target.value || null) as Unit | null })} options={UNIT_OPTIONS}
          error={!item.unit ? "Informe a unidade." : null} />
        <Input label="Categoria" maxLength={60} {...txt("category")} />
      </div>

      <section aria-labelledby={`foto-${item.id}`} className="rounded-2xl border border-line p-3">
        <h3 id={`foto-${item.id}`} className="mb-2 text-sm font-semibold">Foto e enquadramento</h3>
        <div className="flex items-start gap-3">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-line bg-white">
            {item.imageAssetId ? (
              <img src={assetUrl(item.imageAssetId)!} alt="" className="h-full w-full object-contain"
                style={{ objectPosition: `${fit.x}% ${fit.y}%`, transform: `scale(${fit.zoom})`, transformOrigin: `${fit.x}% ${fit.y}%` }} />
            ) : <span className="flex h-full items-center justify-center text-ink-muted"><IconImage size={32} /></span>}
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPicker(true)}>{item.imageAssetId ? "Trocar foto" : "Escolher foto"}</Button>
            {item.imageAssetId && <Button size="sm" variant="ghost" onClick={() => onChange({ imageAssetId: null })}>Remover foto</Button>}
          </div>
        </div>
        {item.imageAssetId && (
          <div className="mt-3 grid gap-2">
            <Slider label="Posição horizontal" value={fit.x} min={0} max={100} step={1} onChange={(v) => setFit({ x: v })} suffix="%" />
            <Slider label="Posição vertical" value={fit.y} min={0} max={100} step={1} onChange={(v) => setFit({ y: v })} suffix="%" />
            <Slider label="Zoom" value={fit.zoom} min={1} max={3} step={0.05} onChange={(v) => setFit({ zoom: v })} format={(v) => `${v.toFixed(2).replace(".", ",")}×`} />
            <button type="button" className="justify-self-start text-xs font-semibold text-brand underline" onClick={() => onChange({ imageFit: { x: 50, y: 50, zoom: 1 } })}>Centralizar</button>
            <p className="text-xs text-ink-muted">A foto nunca é esticada: só muda o enquadramento.</p>
          </div>
        )}
      </section>

      <section aria-label="Oferta" className="rounded-2xl border border-line p-3">
        <OfferEditor offer={item.offer} unit={item.unit} onChange={(o) => onChange({ offer: o }, `${item.id}.offer`)} minMarginBp={minMarginBp} disabled={readOnly} />
      </section>

      <div className="flex flex-col gap-3">
        <Checkbox label="Produto em destaque" description="Aparece maior no encarte e nos posts." checked={item.highlight} onChange={(v) => onChange({ highlight: v })} />
        <Checkbox label="Pausar (acabou o estoque)" description="Some da vitrine sem excluir. Materiais já impressos não mudam." checked={item.paused} onChange={(v) => onChange({ paused: v })} />
      </div>

      <div className="flex items-end gap-2">
        <Input label={`Mover para a posição (1 a ${total})`} inputMode="numeric" value={pos} onChange={(e) => setPos(e.target.value.replace(/\D/g, ""))} className="w-24" />
        <Button variant="secondary" disabled={!posN || posN < 1 || posN > total || posN === index + 1} onClick={() => onMove(posN - 1)}>Mover</Button>
      </div>

      <Button variant="ghost" className="justify-start text-danger" icon={<IconTrash size={18} />} onClick={onRemove}>Remover da campanha</Button>

      <PhotoPicker open={picker} onClose={() => setPicker(false)} productName={item.name}
        onPick={(assetId) => { onChange({ imageAssetId: assetId, imageFit: { x: 50, y: 50, zoom: 1 } }); setPicker(false); }} />
    </fieldset>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string; format?: (v: number) => string }) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-sm">
      <span>{label}</span>
      <span className="tabular-nums text-ink-muted">{format ? format(value) : `${Math.round(value)}${suffix ?? ""}`}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="col-span-2 h-8 w-full accent-[rgb(var(--ev-brand))]" />
    </label>
  );
}

/** Escolhe foto entre as imagens do catálogo ou envia uma nova. */
function PhotoPicker({ open, onClose, onPick, productName }: { open: boolean; onClose: () => void; onPick: (assetId: string) => void; productName: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open || products) return;
    fetchAllProducts().then((ps) => setProducts(ps.filter((p) => p.imageAssetId))).catch((e) => setError(e.message));
  }, [open, products]);
  useEffect(() => { if (open) setQ(productName.split(" ")[0] ?? ""); }, [open, productName]);
  const n = normalizeName(q);
  const shown = (products ?? []).filter((p) => !n || normalizeName(p.name).includes(n));
  return (
    <Dialog open={open} onClose={onClose} title="Escolher foto" size="lg">
      <ImageUpload label="Enviar foto nova" value={null} onUploaded={(a) => onPick(a.id)} />
      <hr className="my-4 border-line" />
      <Input label="Fotos do catálogo" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" />
      {error ? <ErrorState message={error} /> : !products ? <LoadingBlock /> : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">Nenhuma foto encontrada{q && " para essa busca"}.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shown.slice(0, 60).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.imageAssetId!)} className="flex w-full flex-col items-center gap-1 rounded-xl border border-line p-1 hover:border-brand">
                <Thumb url={p.imageUrl ?? assetUrl(p.imageAssetId)} alt={p.name} size={80} />
                <span className="line-clamp-2 text-center text-xs">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
