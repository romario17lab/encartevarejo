"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, PriceInput, Tabs, Textarea, toast } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { parseBRL } from "@/domain/money";
import { api, asList, type BulkPriceChange, type BulkPriceDiffRow, type Product } from "@/lib/client/api";
import { fmtPct, money, pctChange } from "@/lib/client/format";
import { fetchAllProducts, normalizeName } from "@/lib/client/products";

type Edits = Record<string, { regularCents?: number | null; promoCents?: number | null }>;

export default function BulkPricePage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"lista" | "colar">("lista");
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Edits>({});
  const [paste, setPaste] = useState("");
  const [pasteTarget, setPasteTarget] = useState<"promoCents" | "regularCents">("promoCents");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [diff, setDiff] = useState<BulkPriceDiffRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => { setError(null); fetchAllProducts().then(setProducts).catch((e) => setError(e.message)); };
  useEffect(load, []);

  const visible = useMemo(() => {
    const f = normalizeName(filter);
    return (products ?? []).filter((p) => !f || normalizeName(`${p.name} ${p.brand ?? ""}`).includes(f));
  }, [products, filter]);

  const changes: BulkPriceChange[] = useMemo(() => Object.entries(edits).map(([productId, e]) => ({ productId, ...e }))
    .filter((c) => { const p = products?.find((x) => x.id === c.productId); return p && ((c.regularCents !== undefined && c.regularCents !== p.regularCents) || (c.promoCents !== undefined && c.promoCents !== p.promoCents)); }), [edits, products]);

  const applyPaste = () => {
    const byName = new Map((products ?? []).map((p) => [normalizeName(p.name), p]));
    const next: Edits = { ...edits };
    const miss: string[] = [];
    for (const line of paste.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^(.*?)[;\t]\s*(.+)$/) ?? line.match(/^(.*\D)\s+(R?\$?\s*[\d.,]+)\s*$/);
      const name = m?.[1]?.trim(); const cents = m ? parseBRL(m[2].trim()) : null;
      const p = name ? byName.get(normalizeName(name)) : undefined;
      if (!p || cents == null) { miss.push(line.trim()); continue; }
      next[p.id] = { ...next[p.id], [pasteTarget]: cents };
    }
    setEdits(next); setUnmatched(miss);
    toast("Preços aplicados na lista. Confira antes de revisar.", "info");
    setMode("lista");
  };

  const review = async () => {
    setBusy(true);
    try {
      const res = await api.post<unknown>("/api/products/bulk-price/preview", { changes });
      setDiff(asList<BulkPriceDiffRow>(res, "diff", "changes", "rows"));
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/api/products/bulk-price/commit", { changes });
      toast(`${changes.length} ${changes.length === 1 ? "preço atualizado" : "preços atualizados"}.`, "success");
      setDiff(null); setEdits({}); load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const setEdit = (id: string, k: "regularCents" | "promoCents", v: number | null) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  return (
    <>
      <PageHeader title="Atualizar preços" back={{ href: "/app/produtos", label: "Produtos" }}
        description="Altere vários preços e confira as diferenças antes de confirmar. Campanhas aprovadas não mudam sozinhas." />
      {error ? <ErrorState message={error} onRetry={load} /> : !products ? <LoadingBlock label="Carregando catálogo…" /> : products.length === 0 ? (
        <EmptyState title="Nenhum produto no catálogo" action={<Link href="/app/produtos" className="font-semibold text-brand underline">Cadastrar produtos</Link>} />
      ) : (
        <>
          <Tabs value={mode} onChange={setMode} tabs={[{ value: "lista", label: "Editar na lista" }, { value: "colar", label: "Colar “nome;preço”" }]} className="mb-4" />
          {mode === "colar" ? (
            <Card>
              <Textarea label="Uma linha por produto: nome;preço" value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} className="font-mono text-sm"
                placeholder={"Arroz branco tipo 1;24,90\nFeijão carioca;7,49"} hint="O nome precisa ser igual ao do catálogo (maiúsculas e acentos não importam)." />
              <fieldset className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-4">
                <legend className="mb-1 text-sm font-semibold">Aplicar como</legend>
                {([["promoCents", "Preço promocional"], ["regularCents", "Preço normal"]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="target" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={pasteTarget === v} onChange={() => setPasteTarget(v)} />{l}</label>
                ))}
              </fieldset>
              <div className="mt-3 flex justify-end"><Button onClick={applyPaste} disabled={!paste.trim()}>Aplicar na lista</Button></div>
            </Card>
          ) : (
            <>
              {unmatched.length > 0 && (
                <div role="alert" className="mb-3 rounded-xl border border-warning bg-warning/10 p-3 text-sm">
                  <p className="font-semibold">{unmatched.length} linhas não encontradas no catálogo:</p>
                  <ul className="mt-1 list-inside list-disc">{unmatched.slice(0, 10).map((u) => <li key={u}>{u}</li>)}</ul>
                </div>
              )}
              <Input label="Filtrar" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Digite parte do nome" />
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {visible.map((p) => {
                  const e = edits[p.id] ?? {};
                  const reg = e.regularCents !== undefined ? e.regularCents : p.regularCents;
                  const promo = e.promoCents !== undefined ? e.promoCents : p.promoCents;
                  const changed = (e.regularCents !== undefined && e.regularCents !== p.regularCents) || (e.promoCents !== undefined && e.promoCents !== p.promoCents);
                  return (
                    <li key={p.id} className={`grid grid-cols-2 items-end gap-2 p-3 sm:grid-cols-[2fr_1fr_1fr] ${changed ? "bg-brand-soft/50" : ""}`}>
                      <p className="col-span-2 text-sm font-semibold sm:col-span-1 sm:self-center">{p.name}{p.sizeLabel && <span className="font-normal text-ink-muted"> · {p.sizeLabel}</span>}{changed && <Badge tone="brand" className="ml-2">alterado</Badge>}</p>
                      <PriceInput label="Normal" value={reg ?? null} onChange={(v) => setEdit(p.id, "regularCents", v)} />
                      <PriceInput label="Promo" value={promo ?? null} onChange={(v) => setEdit(p.id, "promoCents", v)} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="sticky bottom-20 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm lg:bottom-4">
            <span className="text-sm" aria-live="polite">{changes.length} {changes.length === 1 ? "alteração" : "alterações"}</span>
            <div className="flex gap-2">
              {changes.length > 0 && <Button variant="ghost" onClick={() => setEdits({})}>Descartar</Button>}
              <Button onClick={review} loading={busy} disabled={!changes.length}>Revisar alterações</Button>
            </div>
          </div>
        </>
      )}
      <Dialog open={!!diff} onClose={() => setDiff(null)} title="Confira antes de confirmar" size="lg"
        footer={<><Button variant="secondary" onClick={() => setDiff(null)}>Voltar e ajustar</Button><Button onClick={confirm} loading={busy}>Confirmar {changes.length} alterações</Button></>}>
        <ul className="flex flex-col gap-2">
          {(diff ?? []).map((d) => (
            <li key={d.productId} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">{d.name}</p>
              <DiffLine label="Normal" o={d.oldRegularCents} n={d.newRegularCents} />
              <DiffLine label="Promo" o={d.oldPromoCents} n={d.newPromoCents} />
              {d.warnings?.map((w) => <p key={w} className="mt-1 text-xs font-semibold text-danger">⚠ {w}</p>)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">Campanhas já aprovadas que usam esses produtos não são alteradas automaticamente.</p>
      </Dialog>
    </>
  );
}

function DiffLine({ label, o, n }: { label: string; o: number | null; n: number | null }) {
  if (o === n) return null;
  const pct = pctChange(o, n);
  const big = pct != null && Math.abs(pct) >= 30;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2">
      <span className="w-14 text-ink-muted">{label}</span>
      <span className="tabular-nums line-through decoration-ink-muted">{money(o)}</span>→<strong className="tabular-nums">{money(n)}</strong>
      <span className={big ? "font-semibold text-danger" : "text-ink-muted"}>{fmtPct(pct)}{big && " (variação grande)"}</span>
    </p>
  );
}
