"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Card, ErrorState, Select } from "@/components/ui";
import { PageHeader } from "@/components/app/common";
import { IconUpload } from "@/components/app/icons";
import { parseBRL, formatBRL } from "@/domain/money";
import { UNITS } from "@/domain/offer";
import { api, type ImportPreview, type ImportResult } from "@/lib/client/api";

const FIELDS: Array<{ key: string; label: string; required?: boolean; price?: boolean }> = [
  { key: "name", label: "Nome do produto", required: true },
  { key: "brand", label: "Marca" },
  { key: "category", label: "Categoria" },
  { key: "sizeLabel", label: "Tamanho / embalagem" },
  { key: "unit", label: "Unidade" },
  { key: "barcode", label: "Código de barras" },
  { key: "regularCents", label: "Preço normal", price: true },
  { key: "promoCents", label: "Preço promocional", price: true },
  { key: "costCents", label: "Custo (privado)", price: true },
];
const STEPS = ["Arquivo", "Colunas", "Conferir", "Resultado"];
type Mapping = Record<string, string | null>;

function normalizeMapping(sug: Record<string, string | null> | undefined, columns: string[]): Mapping {
  const m: Mapping = Object.fromEntries(FIELDS.map((f) => [f.key, null]));
  if (!sug) return m;
  const fieldKeys = new Set(FIELDS.map((f) => f.key));
  for (const [k, v] of Object.entries(sug)) {
    if (fieldKeys.has(k) && (v == null || columns.includes(v))) m[k] = v;
    else if (columns.includes(k) && v && fieldKeys.has(v)) m[v] = k; // formato invertido coluna → campo
  }
  return m;
}
const cell = (row: Record<string, unknown> | unknown[], columns: string[], col: string | null): string => {
  if (!col) return "";
  const v = Array.isArray(row) ? row[columns.indexOf(col)] : row[col];
  return v == null ? "" : String(v).trim();
};
const unitFrom = (s: string) => {
  const t = s.toLowerCase().replace(/\.$/, "");
  if (!t) return null;
  if (t in UNITS) return t;
  const hit = Object.entries(UNITS).find(([, u]) => u.short.toLowerCase() === t || u.label === t);
  return hit ? hit[0] : undefined;
};

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update" | "create">("skip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const p = await api.upload<ImportPreview>("/api/products/import/preview", fd);
      setPreview(p);
      setMapping(normalizeMapping(p.suggestedMapping, p.columns));
      setStep(1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const rows = useMemo(() => {
    if (!preview) return [];
    if (preview.rowsPreview?.length) {
      return preview.rowsPreview.map((r) => ({ row: r.row, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v == null ? "" : String(v)])), errors: r.errors ?? [], warnings: [] as string[], duplicate: !!r.duplicateOf }));
    }
    const seen = new Map<string, number>();
    return preview.sampleRows.map((raw, i) => {
      const values: Record<string, string> = {};
      for (const f of FIELDS) values[f.key] = cell(raw, preview.columns, mapping[f.key] ?? null);
      const errors: string[] = []; const warnings: string[] = [];
      if (!values.name) errors.push("Sem nome");
      for (const f of FIELDS.filter((x) => x.price)) {
        if (values[f.key] && parseBRL(values[f.key]) == null) errors.push(`${f.label} inválido: "${values[f.key]}"`);
      }
      if (values.unit && unitFrom(values.unit) === undefined) warnings.push(`Unidade "${values.unit}" não reconhecida`);
      if (!values.unit) warnings.push("Sem unidade");
      const key = values.name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
      const dup = key ? seen.has(key) : false;
      if (key && !dup) seen.set(key, i + 2);
      return { row: i + 2, values, errors, warnings, duplicate: dup };
    });
  }, [preview, mapping]);

  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<ImportResult>("/api/products/import/commit", { importId: preview.importId, mapping, options: { onDuplicate } });
      setResult(r); setStep(3);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const mappedCols = Object.values(mapping).filter(Boolean) as string[];
  const dupCols = mappedCols.filter((c, i) => mappedCols.indexOf(c) !== i);

  return (
    <>
      <PageHeader title="Importar planilha" back={{ href: "/app/produtos", label: "Produtos" }} description="CSV ou Excel (XLSX) exportado do seu sistema. Você confere tudo antes de salvar." />
      <ol className="mb-5 flex gap-1 overflow-x-auto text-sm" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 font-semibold ${i === step ? "bg-brand text-white" : i < step ? "bg-brand-soft text-brand-strong" : "bg-ink/5 text-ink-muted"}`}>
            <span>{i + 1}</span>{s}
          </li>
        ))}
      </ol>
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {step === 0 && (
        <Card>
          <label htmlFor="import-file" className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line p-8 text-center hover:border-brand">
            <IconUpload size={32} />
            <span className="font-semibold">{file ? file.name : "Escolher arquivo CSV ou XLSX"}</span>
            <span className="text-sm text-ink-muted">A primeira linha deve ter os nomes das colunas.</span>
          </label>
          <input id="import-file" ref={inputRef} type="file" className="sr-only" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="mt-4 flex justify-end"><Button onClick={upload} loading={busy} disabled={!file}>Continuar</Button></div>
        </Card>
      )}

      {step === 1 && preview && (
        <Card>
          <p className="mb-4 text-sm text-ink-muted">Encontramos <strong>{preview.totalRows}</strong> linhas e {preview.columns.length} colunas. Diga qual coluna corresponde a cada campo. Já sugerimos o que conseguimos reconhecer.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Select key={f.key} label={f.label} required={f.required} value={mapping[f.key] ?? ""}
                onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                options={[{ value: "", label: "— Não importar —" }, ...preview.columns.map((c) => ({ value: c, label: c }))]}
                error={mapping[f.key] && dupCols.includes(mapping[f.key]!) ? "Coluna usada em mais de um campo." : null} />
            ))}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => setStep(0)}>Voltar</Button>
            <Button onClick={() => setStep(2)} disabled={!mapping.name}>Conferir dados</Button>
          </div>
        </Card>
      )}

      {step === 2 && preview && (
        <Card>
          <p className="mb-3 text-sm text-ink-muted">Prévia das primeiras {rows.length} de {preview.totalRows} linhas. Linhas com erro não serão importadas.</p>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="danger">{rows.filter((r) => r.errors.length).length} com erro</Badge>
            <Badge tone="warning">{rows.filter((r) => r.duplicate).length} repetidas na planilha</Badge>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface-alt text-left text-xs text-ink-muted">
                <tr><th className="p-2">Linha</th>{FIELDS.filter((f) => mapping[f.key]).map((f) => <th key={f.key} className="p-2">{f.label}</th>)}<th className="p-2">Situação</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={`border-t border-line ${r.errors.length ? "bg-danger/5" : r.duplicate || r.warnings.length ? "bg-warning/5" : ""}`}>
                    <td className="p-2 tabular-nums">{r.row}</td>
                    {FIELDS.filter((f) => mapping[f.key]).map((f) => {
                      const v = r.values[f.key] ?? "";
                      const c = f.price && v ? parseBRL(v) : null;
                      return <td key={f.key} className="p-2">{f.price && c != null ? formatBRL(c) : v || <span className="text-ink-muted">—</span>}</td>;
                    })}
                    <td className="p-2 text-xs">
                      {r.errors.map((e) => <p key={e} className="text-danger">{e}</p>)}
                      {r.duplicate && <p className="text-ink">Repetido</p>}
                      {r.warnings.map((w) => <p key={w} className="text-ink-muted">{w}</p>)}
                      {!r.errors.length && !r.duplicate && !r.warnings.length && <span className="text-success">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Se o produto já existir no catálogo</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-4">
              {([["skip", "Pular (manter o atual)"], ["update", "Atualizar dados e preços"], ["create", "Criar outro mesmo assim"]] as const).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="dup" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={onDuplicate === v} onChange={() => setOnDuplicate(v)} />{l}</label>
              ))}
            </div>
          </fieldset>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>Voltar às colunas</Button>
            <Button onClick={commit} loading={busy}>Importar {preview.totalRows} linhas</Button>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          <h2 className="font-display text-xl font-bold" role="status">Importação concluída</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-success/10 p-3"><dt className="text-xs text-ink-muted">Criados</dt><dd className="text-2xl font-bold">{result.created}</dd></div>
            <div className="rounded-xl bg-brand-soft p-3"><dt className="text-xs text-ink-muted">Atualizados</dt><dd className="text-2xl font-bold">{result.updated}</dd></div>
            <div className="rounded-xl bg-ink/5 p-3"><dt className="text-xs text-ink-muted">Pulados</dt><dd className="text-2xl font-bold">{result.skipped}</dd></div>
          </dl>
          {result.errors.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-danger">{result.errors.length} linhas com erro (não importadas)</p>
              <ul className="mt-2 max-h-60 overflow-auto text-sm">{result.errors.map((e, i) => <li key={i}>Linha {e.row}: {e.message}</li>)}</ul>
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/app/produtos?issues=incompleto" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white">Revisar produtos incompletos</Link>
            <Link href="/app/produtos" className="inline-flex h-11 items-center justify-center rounded-xl border border-line px-4 font-semibold">Ver catálogo</Link>
          </div>
        </Card>
      )}
    </>
  );
}
