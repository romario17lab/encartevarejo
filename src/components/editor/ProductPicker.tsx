"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, Input, PriceInput, Select, Tabs, Textarea, toast } from "@/components/ui";
import { LoadingBlock, Thumb } from "@/components/app/common";
import type { Unit } from "@/domain/offer";
import { api, assetUrl, type ParsedRow, type Product } from "@/lib/client/api";
import { money, UNIT_OPTIONS, unitShort } from "@/lib/client/format";
import { fetchAllProducts, normalizeName } from "@/lib/client/products";

type Mode = "catalogo" | "colar" | "rapido";

/**
 * Seleção de produtos para a campanha: busca no catálogo (vários de uma vez), colar lista ou cadastro rápido.
 * `selected` é controlado pelo chamador; produtos criados aqui entram selecionados.
 */
export function ProductPicker({ selected, onChange, excludeIds = [] }: { selected: Product[]; onChange: (p: Product[]) => void; excludeIds?: string[] }) {
  const [mode, setMode] = useState<Mode>("catalogo");
  const [catalog, setCatalog] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); fetchAllProducts().then(setCatalog).catch((e) => setError(e.message)); };
  useEffect(load, []);
  const addCreated = (ps: Product[]) => { setCatalog((c) => [...ps, ...(c ?? [])]); onChange([...selected, ...ps]); };

  return (
    <div>
      <Tabs value={mode} onChange={setMode} className="mb-3" tabs={[
        { value: "catalogo", label: "Do catálogo" }, { value: "colar", label: "Colar lista" }, { value: "rapido", label: "Produto novo" },
      ]} />
      {mode === "catalogo" && (error ? <ErrorState message={error} onRetry={load} /> : !catalog ? <LoadingBlock label="Carregando catálogo…" /> :
        <CatalogSearch catalog={catalog.filter((p) => !excludeIds.includes(p.id))} selected={selected} onChange={onChange} onEmpty={() => setMode("rapido")} />)}
      {mode === "colar" && <PasteCreate onCreated={(ps) => { addCreated(ps); setMode("catalogo"); }} />}
      {mode === "rapido" && <QuickCreate onCreated={(p) => { addCreated([p]); }} />}
      <p className="mt-3 text-sm font-semibold" aria-live="polite">{selected.length} {selected.length === 1 ? "produto selecionado" : "produtos selecionados"}</p>
    </div>
  );
}

function CatalogSearch({ catalog, selected, onChange, onEmpty }: { catalog: Product[]; selected: Product[]; onChange: (p: Product[]) => void; onEmpty: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = useMemo(() => [...new Set(catalog.map((p) => p.category).filter(Boolean) as string[])].sort(), [catalog]);
  const shown = useMemo(() => {
    const n = normalizeName(q);
    return catalog.filter((p) => (!n || normalizeName(`${p.name} ${p.brand ?? ""} ${p.barcode ?? ""}`).includes(n)) && (!cat || p.category === cat)).slice(0, 200);
  }, [catalog, q, cat]);
  const sel = new Set(selected.map((p) => p.id));
  const toggle = (p: Product) => onChange(sel.has(p.id) ? selected.filter((x) => x.id !== p.id) : [...selected, p]);
  if (!catalog.length) return <EmptyState title="Seu catálogo está vazio" description="Cadastre um produto novo ou cole uma lista." action={<Button onClick={onEmpty}>Cadastrar produto</Button>} />;
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
        <Input label="Buscar no catálogo" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou código" />
        <Select label="Categoria" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: "", label: "Todas" }, ...cats.map((c) => ({ value: c, label: c }))]} />
      </div>
      <div className="mt-2 flex gap-2 text-sm">
        <button type="button" className="font-semibold text-brand underline" onClick={() => onChange([...selected, ...shown.filter((p) => !sel.has(p.id))])}>Selecionar os {shown.length} visíveis</button>
        {selected.length > 0 && <button type="button" className="font-semibold text-ink-muted underline" onClick={() => onChange([])}>Limpar seleção</button>}
      </div>
      <ul className="mt-2 flex max-h-[50vh] flex-col gap-1 overflow-auto rounded-xl border border-line p-1">
        {shown.map((p) => (
          <li key={p.id}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 ${sel.has(p.id) ? "bg-brand-soft" : "hover:bg-surface-alt"}`}>
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-[rgb(var(--ev-brand))]" checked={sel.has(p.id)} onChange={() => toggle(p)} />
              <Thumb url={p.imageUrl ?? assetUrl(p.imageAssetId)} alt="" size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block text-xs text-ink-muted">{[p.sizeLabel, unitShort(p.unit) || "sem unidade"].filter(Boolean).join(" · ")} · {p.promoCents != null ? money(p.promoCents) : money(p.regularCents)}</span>
              </span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="p-4 text-center text-sm text-ink-muted">Nada encontrado.</li>}
      </ul>
    </div>
  );
}

function QuickCreate({ onCreated }: { onCreated: (p: Product) => void }) {
  const [name, setName] = useState("");
  const [sizeLabel, setSize] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<Product | { product: Product }>("/api/products", { name: name.trim(), sizeLabel: sizeLabel || null, unit: unit || null, regularCents: price });
      const p = "product" in res && res.product ? res.product : (res as Product);
      onCreated(p);
      toast(`"${p.name}" cadastrado e adicionado.`, "success");
      setName(""); setSize(""); setUnit(""); setPrice(null);
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Input label="Nome do produto" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
      <Input label="Tamanho / embalagem" value={sizeLabel} onChange={(e) => setSize(e.target.value)} maxLength={40} placeholder="Ex.: Pacote 1kg" />
      <Select label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value as Unit | "")} options={UNIT_OPTIONS} />
      <PriceInput label="Preço" value={price} onChange={setPrice} />
      <div className="flex items-end"><Button type="submit" loading={busy} disabled={!name.trim()} block>Cadastrar e adicionar</Button></div>
      <p className="text-xs text-ink-muted sm:col-span-2">Foto e demais dados podem ser completados depois em Produtos.</p>
    </form>
  );
}

function PasteCreate({ onCreated }: { onCreated: (p: Product[]) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Array<ParsedRow & { keep: boolean }> | null>(null);
  const [busy, setBusy] = useState(false);
  const parse = async () => {
    setBusy(true);
    try { const r = await api.post<{ rows: ParsedRow[] }>("/api/products/parse-text", { text }); setRows(r.rows.map((x) => ({ ...x, keep: !!x.name }))); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const upd = (i: number, p: Partial<ParsedRow & { keep: boolean }>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const create = async () => {
    setBusy(true);
    const created: Product[] = [];
    try {
      for (const r of rows!.filter((x) => x.keep && x.name?.trim())) {
        const res = await api.post<Product | { product: Product }>("/api/products", { name: r.name!.trim(), sizeLabel: r.sizeLabel, unit: r.unit, regularCents: r.priceCents });
        created.push("product" in res && res.product ? res.product : (res as Product));
      }
      toast(`${created.length} produtos cadastrados e adicionados.`, "success");
      onCreated(created);
    } catch (e) { toast((e as Error).message, "error"); if (created.length) onCreated(created); }
    finally { setBusy(false); }
  };
  if (!rows) return (
    <div>
      <Textarea label="Cole a lista (um produto por linha)" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"Arroz 5kg 24,90\nFeijão 1kg 7,49"} className="font-mono text-sm" />
      <div className="mt-2 flex justify-end"><Button onClick={parse} loading={busy} disabled={!text.trim()}>Ler lista</Button></div>
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-sm text-ink-muted">Revise cada linha. Nada foi completado além do que estava no texto.</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className={`grid grid-cols-[auto_1fr] gap-2 rounded-xl border p-2 sm:grid-cols-[auto_2fr_1fr_1fr] ${r.issues.length || !r.unit || r.priceCents == null ? "border-warning bg-warning/5" : "border-line"}`}>
            <input type="checkbox" aria-label={`Incluir linha ${r.line}`} className="mt-2 h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={r.keep} onChange={(e) => upd(i, { keep: e.target.checked })} />
            <input aria-label="Nome" className="h-10 rounded-lg border border-line bg-surface px-2 text-sm" value={r.name ?? ""} onChange={(e) => upd(i, { name: e.target.value })} />
            <select aria-label="Unidade" className="col-start-2 h-10 rounded-lg border border-line bg-surface px-2 text-sm sm:col-start-auto" value={r.unit ?? ""} onChange={(e) => upd(i, { unit: (e.target.value || null) as Unit | null })}>
              {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="col-start-2 sm:col-start-auto"><PriceInput value={r.priceCents} onChange={(v) => upd(i, { priceCents: v })} /></div>
            {r.issues.length > 0 && <p className="col-span-full text-xs">⚠ {r.issues.join(" · ")}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between gap-2">
        <Button variant="ghost" onClick={() => setRows(null)}>Voltar</Button>
        <Button onClick={create} loading={busy} disabled={!rows.some((r) => r.keep)}>Cadastrar e adicionar</Button>
      </div>
    </div>
  );
}
