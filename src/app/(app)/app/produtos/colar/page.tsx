"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorState, PriceInput, Textarea, toast } from "@/components/ui";
import { Checkbox, PageHeader } from "@/components/app/common";
import type { Unit } from "@/domain/offer";
import { api, type ParsedRow } from "@/lib/client/api";
import { UNIT_OPTIONS } from "@/lib/client/format";

type Row = ParsedRow & { selected: boolean; saved?: boolean; error?: string };
const EXAMPLE = "Arroz Tio João 5kg 24,90\nFeijão carioca 1kg - 7,49\nBanana prata kg 4,99";

export default function PastePage() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asPromo, setAsPromo] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const parse = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await api.post<{ rows: ParsedRow[] }>("/api/products/parse-text", { text });
      setRows(res.rows.map((r) => ({ ...r, selected: !!r.name && r.priceCents != null && !r.issues.length })));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    if (!rows) return;
    setBusy(true);
    let ok = 0;
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      if (!r.selected || r.saved) continue;
      if (!r.name?.trim()) { next[i] = { ...r, error: "Informe o nome." }; continue; }
      try {
        await api.post("/api/products", {
          name: r.name.trim(), sizeLabel: r.sizeLabel || null, unit: r.unit || null,
          regularCents: asPromo ? null : r.priceCents, promoCents: asPromo ? r.priceCents : null,
        });
        next[i] = { ...r, saved: true, error: undefined, selected: false }; ok++;
      } catch (e) { next[i] = { ...r, error: (e as Error).message }; }
    }
    setRows(next); setBusy(false); setDone(ok);
    if (ok) toast(`${ok} ${ok === 1 ? "produto salvo" : "produtos salvos"}.`, "success");
  };
  const selectedCount = rows?.filter((r) => r.selected && !r.saved).length ?? 0;

  return (
    <>
      <PageHeader title="Colar lista de produtos" back={{ href: "/app/produtos", label: "Produtos" }}
        description="Cole uma lista do WhatsApp, e-mail ou planilha. Uma linha por produto. Você revisa tudo antes de salvar." />
      <Card>
        <Textarea label="Lista" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={EXAMPLE} className="font-mono text-sm"
          hint="Exemplo: “Arroz 5kg 24,90”. Não completamos nada que não esteja no texto." />
        <div className="mt-3 flex justify-end"><Button onClick={parse} loading={busy && !rows} disabled={!text.trim()}>Ler lista</Button></div>
      </Card>
      {error && <div className="mt-4"><ErrorState message={error} /></div>}

      {rows && (
        <Card className="mt-4">
          <h2 className="font-display text-lg font-bold">Revise antes de salvar</h2>
          <p className="mb-3 text-sm text-ink-muted">{rows.length} linhas lidas. Linhas destacadas precisam de atenção. Corrija os campos e marque o que deve ser salvo.</p>
          <div className="mb-3"><Checkbox label="Os preços da lista são promocionais" description="Desmarcado: salvamos como preço normal." checked={asPromo} onChange={setAsPromo} /></div>
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const flagged = r.issues.length > 0 || !r.name || r.priceCents == null || !r.unit || !!r.error;
              return (
                <li key={i} className={`rounded-2xl border p-3 ${r.saved ? "border-success/40 bg-success/5" : flagged ? "border-warning bg-warning/5" : "border-line"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" aria-label={`Salvar linha ${r.line}`} className="mt-3 h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={r.selected} disabled={r.saved} onChange={(e) => upd(i, { selected: e.target.checked })} />
                    <div className="grid flex-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                      <label className="text-xs font-medium">Nome<input className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={r.name ?? ""} onChange={(e) => upd(i, { name: e.target.value })} disabled={r.saved} /></label>
                      <label className="text-xs font-medium">Tamanho<input className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={r.sizeLabel ?? ""} onChange={(e) => upd(i, { sizeLabel: e.target.value || null })} disabled={r.saved} /></label>
                      <label className="text-xs font-medium">Unidade
                        <select className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={r.unit ?? ""} onChange={(e) => upd(i, { unit: (e.target.value || null) as Unit | null })} disabled={r.saved}>
                          {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <PriceInput label="Preço" value={r.priceCents} onChange={(v) => upd(i, { priceCents: v })} disabled={r.saved} />
                    </div>
                  </div>
                  <div className="ml-8 mt-1 text-xs">
                    <span className="text-ink-muted">Linha {r.line}{r.raw ? `: “${r.raw}”` : ""}</span>
                    {r.issues.map((x) => <p key={x} className="text-ink">⚠ {x}</p>)}
                    {!r.unit && r.suggestedUnit && !r.saved && (
                      <button type="button" className="mt-1 font-semibold text-brand underline" onClick={() => upd(i, { unit: r.suggestedUnit! })}>Usar unidade sugerida: {r.suggestedUnit}</button>
                    )}
                    {r.error && <p className="text-danger">{r.error}</p>}
                    {r.saved && <p className="font-semibold text-success">Salvo</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-20 mt-4 flex flex-col gap-2 rounded-2xl bg-surface/95 py-2 sm:flex-row sm:justify-end lg:bottom-0">
            {done != null && <Link href="/app/produtos" className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-4 font-semibold">Ver catálogo</Link>}
            <Button onClick={save} loading={busy} disabled={!selectedCount}>Salvar {selectedCount} {selectedCount === 1 ? "produto" : "produtos"}</Button>
          </div>
        </Card>
      )}
    </>
  );
}
