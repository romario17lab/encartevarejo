"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Button, Card, ErrorState, PriceInput, toast } from "@/components/ui";
import { IconUpload } from "@/components/app/icons";
import type { Unit } from "@/domain/offer";
import { api } from "@/lib/client/api";
import { money, UNIT_OPTIONS } from "@/lib/client/format";
import { AiBadge, CreditsMeter, NotConfigured, ReviewNotice, useAiStatus, CONFIDENCE_LABEL } from "./shared";

// "Extrair com IA": texto colado, foto de lista/tabela de preços ou PDF → linhas para revisão.
// Nada é salvo até o usuário confirmar cada linha. Reaproveita o padrão visual da revisão de "Colar lista".

type Conf = "alta" | "media" | "baixa";
interface Match { productId: string; name: string; sizeLabel: string | null; brand: string | null; regularCents: number | null; promoCents: number | null; kind: "igual" | "parecido" }
interface Line {
  index: number; sourceText: string | null; name: string | null; brand: string | null; sizeLabel: string | null; unit: Unit | null;
  regularCents: number | null; promoCents: number | null; conditions: string | null; category: string | null;
  confidence: Record<"name" | "brand" | "size" | "unit" | "price" | "conditions", Conf>; flags: string[]; priceCheck: boolean; match: Match | null;
}
interface ExtractResult { requestId: string; credits: number; sourceType: "texto" | "imagem" | "pdf"; lines: Line[]; notes: string | null }
type Row = Line & { confirmed: boolean; action: "create" | "update" };

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;

export function AiExtractPanel({ text }: { text?: string }) {
  const status = useAiStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<{ created: number; updated: number } | null>(null);

  const s = status.data;
  const configured = !!s?.configured.llm;

  const pick = (f: File | null) => {
    setError(null);
    if (!f) { setFile(null); return; }
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { setError("Envie uma foto (JPG, PNG ou WebP) ou um PDF."); return; }
    if (f.size > MAX_BYTES) { setError("O arquivo passa de 8 MB. Envie um arquivo menor."); return; }
    setFile(f);
  };

  const run = async (from: "texto" | "arquivo") => {
    setBusy(true); setError(null); setSaved(null);
    try {
      let r: ExtractResult;
      if (from === "arquivo" && file) {
        const fd = new FormData(); fd.append("file", file);
        r = await api.upload<ExtractResult>("/api/ai/extract", fd);
      } else {
        r = await api.post<ExtractResult>("/api/ai/extract", { text: text ?? "" });
      }
      setResult(r);
      setRows(r.lines.map((l) => ({ ...l, confirmed: false, action: l.match ? "update" : "create" })));
      void status.reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const upd = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const confirmed = rows.filter((r) => r.confirmed);

  const save = async () => {
    if (!result || !confirmed.length) return;
    const missing = confirmed.find((r) => !r.name?.trim());
    if (missing) { toast("Informe o nome em todas as linhas confirmadas.", "error"); return; }
    setBusy(true);
    try {
      const res = await api.post<{ created: number; updated: number }>("/api/ai/extract/commit", {
        requestId: result.requestId,
        lines: confirmed.map((r) => ({
          confirmed: true, action: r.action, productId: r.action === "update" ? r.match?.productId ?? null : null,
          name: r.name!.trim(), brand: r.brand || null, category: r.category || null, sizeLabel: r.sizeLabel || null, unit: r.unit || null,
          regularCents: r.regularCents, promoCents: r.promoCents, conditions: r.conditions || null,
        })),
      });
      setSaved(res); setResult(null); setRows([]);
      toast(`${res.created} criado(s), ${res.updated} atualizado(s).`, "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  const discard = async () => {
    if (result) await api.post(`/api/ai/requests/${result.requestId}`, { status: "descartada" }).catch(() => {});
    setResult(null); setRows([]);
  };

  return (
    <Card className="mt-4" id="ia">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-bold">Extrair com IA</h2>
        <AiBadge />
      </div>
      <p className="mt-1 text-sm text-ink-muted">Leia a lista colada acima, uma foto de lista (escrita à mão ou impressa), uma tabela de preços ou um PDF. Você revisa e confirma cada linha antes de salvar.</p>
      {status.loading && <p className="mt-3 text-sm text-ink-muted">Verificando a integração…</p>}
      {s && !configured && <div className="mt-3"><NotConfigured what="Extração por IA" manual={<>Continue usando <strong>Ler lista</strong> (leitura automática sem IA) ou a <Link className="underline" href="/app/produtos/importar">importação de planilha</Link>.</>} /></div>}
      {s && configured && (
        <>
          <CreditsMeter status={s} className="mt-3" />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Button variant="secondary" onClick={() => run("texto")} loading={busy && !file} disabled={busy || !text?.trim()}
              title={!text?.trim() ? "Cole a lista no campo acima" : undefined}>Extrair do texto colado</Button>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input ref={fileRef} id="ai-extract-file" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <Button variant="secondary" icon={<IconUpload size={16} />} onClick={() => fileRef.current?.click()} disabled={busy}>
                {file ? "Trocar arquivo" : "Foto ou PDF da lista"}
              </Button>
              {file && <span className="min-w-0 truncate text-sm" title={file.name}>{file.name}</span>}
              {file && <Button onClick={() => run("arquivo")} loading={busy} disabled={busy}>Extrair do arquivo</Button>}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Custa {s.credits.perRequest.extrair_lista_texto ?? 1} crédito por texto, {s.credits.perRequest.extrair_lista_imagem ?? 2} por foto e {s.credits.perRequest.extrair_lista_pdf ?? 3} por PDF (até 5 páginas, 8 MB).</p>
        </>
      )}
      {error && <div className="mt-3"><ErrorState message={error} /></div>}
      {saved && (
        <p role="status" className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm">
          Salvo: {saved.created} produto(s) criado(s) e {saved.updated} atualizado(s). <Link href="/app/produtos" className="font-semibold underline">Ver catálogo</Link>
        </p>
      )}

      {result && (
        <div className="mt-4">
          <h3 className="font-display text-lg font-bold">Revise antes de salvar</h3>
          <ReviewNotice>
            {result.sourceType === "texto"
              ? "Preços, marcas, tamanhos e unidades que não aparecem no seu texto foram removidos. Confira e confirme cada linha."
              : "Lido de imagem: confira cada preço com a foto. Campos que a IA não conseguiu ler ficam em branco."}
          </ReviewNotice>
          {result.notes && <p className="mt-2 text-sm text-ink-muted">Observação da leitura: {result.notes}</p>}
          <p className="my-3 text-sm text-ink-muted">{rows.length} {rows.length === 1 ? "linha lida" : "linhas lidas"}. Marque “Confirmo” em cada linha conferida.</p>
          {rows.length === 0 && <p className="text-sm">Nenhum produto encontrado na fonte.</p>}
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const flagged = r.flags.length > 0 || !r.name || (r.regularCents == null && r.promoCents == null) || !r.unit;
              const low = (k: keyof Line["confidence"]) => r.confidence[k] === "baixa" ? "border-warning ring-1 ring-warning" : "border-line";
              const inputCls = "mt-1 h-10 w-full rounded-lg border bg-surface px-2 text-sm";
              return (
                <li key={r.index} className={`rounded-2xl border p-3 ${r.confirmed ? "border-success/50 bg-success/5" : flagged ? "border-warning bg-warning/5" : "border-line"}`}>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <label className="text-xs font-medium sm:col-span-2">Nome<input className={`${inputCls} ${low("name")}`} value={r.name ?? ""} onChange={(e) => upd(i, { name: e.target.value, confirmed: false })} /></label>
                    <label className="text-xs font-medium">Marca<input className={`${inputCls} ${low("brand")}`} value={r.brand ?? ""} onChange={(e) => upd(i, { brand: e.target.value || null, confirmed: false })} /></label>
                    <label className="text-xs font-medium">Tamanho<input className={`${inputCls} ${low("size")}`} value={r.sizeLabel ?? ""} onChange={(e) => upd(i, { sizeLabel: e.target.value || null, confirmed: false })} /></label>
                    <label className="text-xs font-medium">Unidade
                      <select className={`${inputCls} ${low("unit")}`} value={r.unit ?? ""} onChange={(e) => upd(i, { unit: (e.target.value || null) as Unit | null, confirmed: false })}>
                        {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <PriceInput label="Preço normal" value={r.regularCents} onChange={(v) => upd(i, { regularCents: v, confirmed: false })} />
                    <PriceInput label="Preço promocional" value={r.promoCents} onChange={(v) => upd(i, { promoCents: v, confirmed: false })} />
                    <label className="text-xs font-medium">Categoria <span className="font-normal text-ink-muted">(sugestão)</span><input className={`${inputCls} border-line`} value={r.category ?? ""} onChange={(e) => upd(i, { category: e.target.value || null })} /></label>
                    <label className="text-xs font-medium sm:col-span-4">Condições<input className={`${inputCls} ${low("conditions")}`} value={r.conditions ?? ""} onChange={(e) => upd(i, { conditions: e.target.value || null, confirmed: false })} placeholder="Ex.: limite de 3 por cliente" /></label>
                  </div>
                  <div className="mt-2 text-xs">
                    {r.sourceText && <p className="text-ink-muted">Na fonte: “{r.sourceText}”</p>}
                    {r.priceCheck && <Badge tone="warning" className="mt-1">Preço lido de imagem: conferir</Badge>}
                    {(["name", "price", "unit"] as const).filter((k) => r.confidence[k] === "baixa").map((k) => (
                      <Badge key={k} tone="warning" className="ml-1 mt-1">{{ name: "Nome", price: "Preço", unit: "Unidade" }[k]}: {CONFIDENCE_LABEL.baixa}</Badge>
                    ))}
                    {r.flags.map((x) => <p key={x} className="text-ink">⚠ {x}</p>)}
                    {r.match && (
                      <div className="mt-2 rounded-xl bg-ink/5 p-2">
                        <p><strong>{r.match.kind === "igual" ? "Já existe no catálogo" : "Parecido com um produto do catálogo"}:</strong> {r.match.name}{r.match.sizeLabel ? ` ${r.match.sizeLabel}` : ""} · normal {money(r.match.regularCents)} · oferta {money(r.match.promoCents)}</p>
                        <div className="mt-1 flex flex-wrap gap-3">
                          <label className="flex items-center gap-2"><input type="radio" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" name={`acao-${r.index}`} checked={r.action === "update"} onChange={() => upd(i, { action: "update", confirmed: false })} />Atualizar o existente</label>
                          <label className="flex items-center gap-2"><input type="radio" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" name={`acao-${r.index}`} checked={r.action === "create"} onChange={() => upd(i, { action: "create", confirmed: false })} />Criar outro produto</label>
                        </div>
                      </div>
                    )}
                  </div>
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={r.confirmed} onChange={(e) => upd(i, { confirmed: e.target.checked })} />
                    Confirmo esta linha {r.action === "update" && r.match ? "(atualizar produto existente)" : "(criar produto)"}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-20 mt-4 flex flex-col gap-2 rounded-2xl bg-surface/95 py-2 sm:flex-row sm:justify-end lg:bottom-0">
            <Button variant="secondary" onClick={discard} disabled={busy}>Descartar leitura</Button>
            <Button onClick={save} loading={busy} disabled={!confirmed.length}>Salvar {confirmed.length} {confirmed.length === 1 ? "linha confirmada" : "linhas confirmadas"}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Atalho para a extração por IA (usado na importação de planilhas). */
export function AiExtractShortcut() {
  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><p className="font-semibold">Lista em foto ou PDF?</p><AiBadge /></div>
          <p className="text-sm text-ink-muted">Extraia com IA a partir de uma foto ou PDF e revise cada linha antes de salvar.</p>
        </div>
        <Link href="/app/produtos/colar#ia" className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-line px-4 font-semibold">Extrair com IA</Link>
      </div>
    </Card>
  );
}
