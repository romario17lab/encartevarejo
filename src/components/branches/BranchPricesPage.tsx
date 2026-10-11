"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, Tabs, Textarea, cx, toast } from "@/components/ui";
import { confirmAction, LoadingBlock, PageHeader } from "@/components/app/common";
import { parseBRL } from "@/domain/money";
import { api, asList, type Product, type Store } from "@/lib/client/api";
import { money } from "@/lib/client/format";
import { useMe } from "@/lib/client/hooks";
import { fetchAllProducts, normalizeName } from "@/lib/client/products";

interface Override { productId: string; regularCents: number | null; promoCents: number | null; updatedAt?: string }
type Draft = { regular: string; promo: string };
type Filter = "todos" | "proprios" | "sem_catalogo";

const centsText = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const PAGE = 60;

/** Lê "R$ 1.234,56" / "12,90" / "" → centavos | null; undefined = inválido. */
function readPrice(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const c = parseBRL(s);
  return c == null ? undefined : c;
}

export function BranchPricesPage({ storeId }: { storeId: string }) {
  const { can } = useMe();
  const canEdit = can("products.write");
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, list, prices] = await Promise.all([
        api.get<Store>(`/api/stores/${storeId}`), fetchAllProducts(), api.get<unknown>(`/api/stores/${storeId}/prices`),
      ]);
      setStore(s); setProducts(list);
      setOverrides(new Map(asList<Override>(prices, "prices").map((o) => [o.productId, o])));
    } catch (e) { setError((e as Error).message); }
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = normalizeName(search);
    return (products ?? []).filter((p) => {
      if (term && !normalizeName(`${p.name} ${p.brand ?? ""} ${p.barcode ?? ""}`).includes(term)) return false;
      if (filter === "proprios") return overrides.has(p.id) || !!drafts[p.id];
      if (filter === "sem_catalogo") return p.regularCents == null && p.promoCents == null;
      return true;
    });
  }, [products, search, filter, overrides, drafts]);

  // alterações pendentes válidas
  const pending = useMemo(() => {
    const upserts: Array<{ productId: string; regularCents: number | null; promoCents: number | null }> = [];
    const clears: string[] = [];
    const invalid: string[] = [];
    for (const [pid, d] of Object.entries(drafts)) {
      const r = readPrice(d.regular); const pr = readPrice(d.promo);
      if (r === undefined || pr === undefined) { invalid.push(pid); continue; }
      const cur = overrides.get(pid);
      if (r == null && pr == null) { if (cur) clears.push(pid); continue; }
      if (cur && cur.regularCents === r && cur.promoCents === pr) continue;
      upserts.push({ productId: pid, regularCents: r, promoCents: pr });
    }
    return { upserts, clears, invalid };
  }, [drafts, overrides]);
  const pendingCount = pending.upserts.length + pending.clears.length;

  const setDraft = (p: Product, patch: Partial<Draft>) => setDrafts((all) => {
    const cur = overrides.get(p.id);
    const base = all[p.id] ?? { regular: centsText(cur?.regularCents), promo: centsText(cur?.promoCents) };
    return { ...all, [p.id]: { ...base, ...patch } };
  });

  const save = async () => {
    if (pending.invalid.length) { toast("Corrija os preços destacados antes de salvar.", "error"); return; }
    setSaving(true);
    try {
      if (pending.upserts.length) await api.put(`/api/stores/${storeId}/prices`, { prices: pending.upserts });
      for (const pid of pending.clears) await api.del(`/api/stores/${storeId}/prices/${pid}`);
      toast(`${pendingCount} preço${pendingCount > 1 ? "s" : ""} da filial salvo${pendingCount > 1 ? "s" : ""}.`, "success");
      setDrafts({});
      await load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  const revertToCatalog = async (p: Product) => {
    if (!overrides.has(p.id)) { setDrafts(({ [p.id]: _x, ...rest }) => rest); return; }
    if (!confirmAction(`Voltar a usar o preço do catálogo para “${p.name}” nesta filial?`)) return;
    try {
      await api.del(`/api/stores/${storeId}/prices/${p.id}`);
      setDrafts(({ [p.id]: _x, ...rest }) => rest);
      toast("A filial volta a usar o preço do catálogo.", "success");
      await load();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const applyPaste = (rows: Array<{ productId: string; regular: string; promo: string }>) => {
    setDrafts((all) => {
      const next = { ...all };
      for (const r of rows) next[r.productId] = { regular: r.regular, promo: r.promo };
      return next;
    });
    setFilter("proprios");
  };

  return (
    <>
      <PageHeader title={store ? `Preços: ${store.name}` : "Preços da filial"} back={{ href: "/app/filiais", label: "Filiais" }}
        description="Preço próprio desta filial. Sem preço próprio, a filial usa o preço do catálogo. Nada é preenchido automaticamente." />
      {error ? <ErrorState message={error} onRetry={load} /> : !products || !store ? <LoadingBlock /> : (
        <>
          <Card className="mb-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1"><Input label="Buscar produto" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Nome, marca ou código de barras" /></div>
              {canEdit && <Button variant="secondary" onClick={() => setPasteOpen(true)}>Colar lista de preços</Button>}
            </div>
            <Tabs value={filter} onChange={(v) => { setFilter(v); setShown(PAGE); }} tabs={[
              { value: "todos", label: `Todos (${products.length})` },
              { value: "proprios", label: `Com preço próprio (${overrides.size})` },
              { value: "sem_catalogo", label: "Sem preço no catálogo" },
            ]} />
            <p className="text-xs text-ink-muted">Normal vazio = usa o preço normal do catálogo. Oferta vazia = sem oferta nesta filial (quando há preço próprio).</p>
          </Card>

          {visible.length === 0 ? <EmptyState title="Nenhum produto encontrado" description={filter === "proprios" ? "Esta filial ainda usa os preços do catálogo para todos os produtos." : "Ajuste a busca ou o filtro."} /> : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {visible.slice(0, shown).map((p) => {
                const cur = overrides.get(p.id);
                const d = drafts[p.id];
                const regular = d ? d.regular : centsText(cur?.regularCents);
                const promo = d ? d.promo : centsText(cur?.promoCents);
                const badR = d && readPrice(d.regular) === undefined; const badP = d && readPrice(d.promo) === undefined;
                const own = !!cur || (d && (d.regular.trim() || d.promo.trim()));
                const noCatalog = p.regularCents == null && p.promoCents == null;
                return (
                  <li key={p.id} className={cx("grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)_auto] md:items-center", d && "bg-brand-soft/40")}>
                    <div className="min-w-0">
                      <p className="font-semibold">{p.name}{p.sizeLabel ? <span className="font-normal text-ink-muted"> · {p.sizeLabel}</span> : null}</p>
                      <p className="text-sm text-ink-muted">
                        Catálogo: {noCatalog ? <span className="font-semibold text-danger">sem preço</span> : <>{money(p.regularCents)}{p.promoCents != null && <> · oferta {money(p.promoCents)}</>}</>}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cur ? <Badge tone="brand">Preço próprio</Badge> : <Badge>Usa o catálogo</Badge>}
                        {d && <Badge tone="warning">Não salvo</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <PriceText label="Normal na filial" value={regular} placeholder="do catálogo" invalid={!!badR} disabled={!canEdit} onChange={(v) => setDraft(p, { regular: v })} />
                      <PriceText label="Oferta na filial" value={promo} placeholder={own ? "sem oferta" : "do catálogo"} invalid={!!badP} disabled={!canEdit} onChange={(v) => setDraft(p, { promo: v })} />
                    </div>
                    {canEdit && (cur || d) ? <Button size="sm" variant="ghost" onClick={() => revertToCatalog(p)}>{cur ? "Usar catálogo" : "Descartar"}</Button> : <span className="hidden md:block md:w-[110px]" />}
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > shown && <div className="mt-3 flex justify-center"><Button variant="secondary" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais ({visible.length - shown})</Button></div>}

          {canEdit && (pendingCount > 0 || pending.invalid.length > 0) && (
            <div className="sticky bottom-20 z-20 mt-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-lg sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                {pendingCount} alteraç{pendingCount === 1 ? "ão" : "ões"} pendente{pendingCount === 1 ? "" : "s"}
                {pending.invalid.length > 0 && <span className="font-semibold text-danger"> · {pending.invalid.length} preço(s) inválido(s)</span>}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setDrafts({})}>Descartar</Button>
                <Button loading={saving} disabled={pendingCount === 0 || pending.invalid.length > 0} onClick={save}>Salvar preços da filial</Button>
              </div>
            </div>
          )}
          {pasteOpen && <PasteDialog products={products} onClose={() => setPasteOpen(false)} onApply={(rows) => { applyPaste(rows); setPasteOpen(false); }} />}
        </>
      )}
    </>
  );
}

function PriceText({ label, value, placeholder, invalid, disabled, onChange }: { label: string; value: string; placeholder: string; invalid: boolean; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <span className={cx("flex h-10 items-center gap-1 rounded-xl border bg-surface px-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25", invalid ? "border-danger" : "border-line-strong/70", disabled && "bg-surface-alt")}>
        <span aria-hidden="true" className="text-sm text-ink-muted">R$</span>
        <input inputMode="decimal" value={value} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)} className="ev-num h-full w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink-muted/70" />
      </span>
      {invalid && <span className="text-xs font-medium text-danger">Valor inválido</span>}
    </label>
  );
}

/** Colar lista: "nome; preço normal; oferta" (oferta opcional) ou "nome<TAB>preço". Casa por nome exato (sem acentos) ou código de barras. */
function PasteDialog({ products, onClose, onApply }: { products: Product[]; onClose: () => void; onApply: (rows: Array<{ productId: string; regular: string; promo: string }>) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    const byName = new Map(products.map((p) => [normalizeName(p.name), p]));
    const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!, p]));
    const ok: Array<{ productId: string; name: string; regular: string; promo: string }> = [];
    const bad: Array<{ line: string; why: string }> = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const cols = line.includes(";") ? line.split(";") : line.includes("\t") ? line.split("\t") : null;
      const m = cols ? null : line.match(/^(.*\D)\s+(R?\$?\s*[\d.,]+)$/);
      const [name, reg = "", promo = ""] = (cols ?? (m ? [m[1]!, m[2]!] : [line])).map((c) => c.trim());
      const p = byBarcode.get(name!.replace(/\D/g, "")) ?? byName.get(normalizeName(name!));
      if (!p) { bad.push({ line, why: "produto não encontrado no catálogo" }); continue; }
      if (!reg && !promo) { bad.push({ line, why: "sem preço" }); continue; }
      if ((reg && parseBRL(reg) == null) || (promo && parseBRL(promo) == null)) { bad.push({ line, why: "preço inválido" }); continue; }
      ok.push({ productId: p.id, name: p.name, regular: reg ? centsText(parseBRL(reg)) : "", promo: promo ? centsText(parseBRL(promo)) : "" });
    }
    return { ok, bad };
  }, [text, products]);

  return (
    <Dialog open onClose={onClose} title="Colar lista de preços da filial" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!parsed.ok.length} onClick={() => onApply(parsed.ok)}>Aplicar {parsed.ok.length || ""} na lista</Button></>}>
      <p className="mb-2 text-sm text-ink-muted">Uma linha por produto: <code>nome; preço normal; oferta</code> (oferta opcional). Também aceita colar duas colunas de planilha. Os preços vão para a lista para você revisar antes de salvar.</p>
      <Textarea label="Lista" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"Arroz tipo 1 5kg; 31,90; 26,90\nFeijão carioca 1kg; 9,49"} />
      {(parsed.ok.length > 0 || parsed.bad.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-success">{parsed.ok.length} reconhecido(s)</p>
            <ul className="mt-1 max-h-40 overflow-auto text-sm">{parsed.ok.map((r) => <li key={r.productId} className="truncate">{r.name}: {r.regular ? `R$ ${r.regular}` : "normal do catálogo"}{r.promo ? ` · oferta R$ ${r.promo}` : ""}</li>)}</ul>
          </div>
          {parsed.bad.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-danger">{parsed.bad.length} não reconhecido(s)</p>
              <ul className="mt-1 max-h-40 overflow-auto text-sm">{parsed.bad.map((b, i) => <li key={i} className="truncate">{b.line} <span className="text-ink-muted">({b.why})</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
