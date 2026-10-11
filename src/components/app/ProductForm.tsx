"use client";
import { useState, type FormEvent } from "react";
import { Button, Input, PriceInput, Select, Textarea, toast } from "@/components/ui";
import { marginBasisPoints, formatBRL } from "@/domain/money";
import type { Unit } from "@/domain/offer";
import { api, assetUrl, type Product, type ProductInput } from "@/lib/client/api";
import { UNIT_OPTIONS } from "@/lib/client/format";
import { ImageUpload } from "./common";
import { RemoveBackgroundButton } from "@/components/ai/RemoveBackgroundButton";

const empty: ProductInput = {
  name: "", brand: null, category: null, sizeLabel: null, unit: null, barcode: null, imageAssetId: null,
  regularCents: null, promoCents: null, costCents: null, conditions: null,
};

/** Formulário de produto (criar/editar). Custo é privado: nunca entra em materiais. */
export function ProductForm({ product, categories = [], onSaved, onCancel, minMarginBp }: {
  product?: Product | null; categories?: string[]; onSaved: (p: Product) => void; onCancel?: () => void; minMarginBp?: number | null;
}) {
  const [f, setF] = useState<ProductInput>(() => (product ? { ...empty, ...product } : { ...empty }));
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? assetUrl(product?.imageAssetId));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const txt = (k: "name" | "brand" | "category" | "sizeLabel" | "barcode" | "conditions") => ({
    value: (f[k] as string | null) ?? "",
    onChange: (e: { target: { value: string } }) => set(k, k === "name" ? e.target.value : e.target.value === "" ? null : e.target.value),
  });

  const salePrice = f.promoCents ?? f.regularCents ?? null;
  const margin = salePrice != null ? marginBasisPoints(salePrice, f.costCents) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Informe o nome do produto.";
    if (f.promoCents != null && f.regularCents != null && f.promoCents >= f.regularCents) errs.promoCents = "O preço promocional precisa ser menor que o preço normal.";
    if (f.barcode && !/^\d{8,14}$/.test(f.barcode)) errs.barcode = "Código de barras deve ter de 8 a 14 dígitos.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { ...f, name: f.name.trim() };
      const res = product
        ? await api.patch<Product | { product: Product }>(`/api/products/${product.id}`, body)
        : await api.post<Product | { product: Product }>("/api/products", body);
      const saved = "product" in res && res.product ? res.product : (res as Product);
      toast(product ? "Produto atualizado." : "Produto cadastrado.", "success");
      onSaved(saved);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally { setSaving(false); }
  };

  const listId = "product-categories";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Input label="Nome do produto" required {...txt("name")} error={errors.name} maxLength={120} placeholder="Ex.: Arroz branco tipo 1" autoFocus={!product} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Marca" {...txt("brand")} maxLength={60} hint="Deixe vazio se não houver marca." />
        <div>
          <Input label="Categoria" {...txt("category")} list={listId} maxLength={60} placeholder="Ex.: Mercearia" />
          <datalist id={listId}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <Input label="Tamanho / embalagem" {...txt("sizeLabel")} maxLength={40} placeholder="Ex.: Pacote 5kg, Lata 350ml" />
        <Select label="Unidade de venda" value={f.unit ?? ""} onChange={(e) => set("unit", (e.target.value || null) as Unit | null)} options={UNIT_OPTIONS} hint="Obrigatória para usar o produto em campanhas." />
        <PriceInput label="Preço normal" value={f.regularCents ?? null} onChange={(v) => set("regularCents", v)} />
        <PriceInput label="Preço promocional" value={f.promoCents ?? null} onChange={(v) => set("promoCents", v)} error={errors.promoCents} hint="Opcional. Usado como sugestão ao criar campanhas." />
        <Input label="Código de barras (EAN)" inputMode="numeric" {...txt("barcode")} error={errors.barcode} hint="Opcional." />
      </div>
      <Textarea label="Condições" {...txt("conditions")} maxLength={160} placeholder="Ex.: Válido para sabores selecionados" className="min-h-[64px]" />

      <fieldset className="rounded-2xl border border-dashed border-warning/60 bg-warning/5 p-4">
        <legend className="px-1 text-sm font-semibold">Custo <span className="font-normal text-ink-muted">(privado, não aparece nos materiais)</span></legend>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <PriceInput label="Custo do produto" value={f.costCents ?? null} onChange={(v) => set("costCents", v)} hint="Só você e sua equipe veem. Serve para calcular a margem." />
          <div aria-live="polite" className="text-sm">
            {margin == null ? <span className="text-ink-muted">Informe custo e preço para ver a margem.</span> : (
              <span className={minMarginBp != null && margin < minMarginBp ? "font-semibold text-danger" : margin < 0 ? "font-semibold text-danger" : "font-semibold"}>
                Margem sobre {formatBRL(salePrice!)}: {(margin / 100).toFixed(1).replace(".", ",")}%
                {minMarginBp != null && margin < minMarginBp && " — abaixo do mínimo da conta"}
              </span>
            )}
          </div>
        </div>
      </fieldset>

      <ImageUpload label="Foto do produto" value={imageUrl}
        onUploaded={(a) => { set("imageAssetId", a.id); setImageUrl(a.url || assetUrl(a.id)); }}
        onClear={() => { set("imageAssetId", null); setImageUrl(null); }} />
      <RemoveBackgroundButton assetId={f.imageAssetId} onChoose={(a) => { set("imageAssetId", a.id); setImageUrl(a.url); }} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={saving}>{product ? "Salvar alterações" : "Cadastrar produto"}</Button>
      </div>
    </form>
  );
}
