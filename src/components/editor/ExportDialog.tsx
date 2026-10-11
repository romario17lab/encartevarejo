"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Dialog, ErrorState, toast } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import { FORMAT_IDS, FORMATS, type FormatId } from "@/domain/formats";
import { api, type ExportJob, type ExportResultInfo } from "@/lib/client/api";
import { fmtBytes } from "@/lib/client/format";

type FileType = "png" | "jpeg" | "pdf";
const FT_LABEL: Record<FileType, string> = { png: "PNG", jpeg: "JPEG", pdf: "PDF" };
const STATUS_TEXT: Record<ExportJob["status"], string> = { na_fila: "Na fila…", processando: "Gerando arquivos…", concluida: "Pronto!", falhou: "Falhou" };

function describe(r: ExportResultInfo) {
  const parts: string[] = [r.fileType.toUpperCase()];
  if (r.widthMm && r.heightMm) parts.push(`${r.widthMm}×${r.heightMm} mm`);
  if (r.widthPx && r.heightPx) parts.push(`${r.widthPx}×${r.heightPx} px`);
  if (r.dpi) parts.push(`${r.dpi} dpi`);
  if (r.pages) parts.push(`${r.pages} ${r.pages === 1 ? "página" : "páginas"}`);
  parts.push(fmtBytes(r.bytes));
  return parts.join(" · ");
}

export function ExportDialog({ open, onClose, campaignId, campaignName, enabledFormats, beforeExport, blockedReason }: {
  open: boolean; onClose: () => void; campaignId: string; campaignName: string; enabledFormats: FormatId[];
  beforeExport: () => Promise<void>; blockedReason?: string | null;
}) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [pkg, setPkg] = useState(true);
  const [bleed, setBleed] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (poll.current) clearTimeout(poll.current); }, []);
  useEffect(() => { if (!open && poll.current) { clearTimeout(poll.current); poll.current = null; } }, [open]);

  const key = (f: FormatId, t: FileType) => `${f}:${t}`;
  const chosen = FORMAT_IDS.flatMap((f) => FORMATS[f].fileTypes.filter((t) => sel[key(f, t)]).map((t) => ({ format: f, fileType: t })));
  const hasPrint = (pkg ? enabledFormats : chosen.map((c) => c.format)).some((f) => FORMATS[f].bleedMm);

  const watch = (id: string) => {
    const tick = async () => {
      try {
        const j = await api.get<ExportJob>(`/api/exports/${id}`);
        setJob(j);
        if (j.status === "na_fila" || j.status === "processando") poll.current = setTimeout(tick, 1500);
      } catch (e) { setError((e as Error).message); }
    };
    void tick();
  };

  const start = async () => {
    setBusy(true); setError(null); setJob(null);
    try {
      await beforeExport();
      const items = pkg ? enabledFormats.map((f) => ({ format: f, fileType: FORMATS[f].fileTypes[0] })) : chosen;
      const j = await api.post<ExportJob>(`/api/campaigns/${campaignId}/exports`, { kind: pkg ? "package" : "single", items, bleed: bleed || undefined });
      setJob(j);
      watch(j.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const downloadUrl = job?.downloadUrl ?? (job?.status === "concluida" ? `/api/exports/${job.id}/download` : null);
  const share = async () => {
    if (!downloadUrl) return;
    try {
      const res = await fetch(downloadUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Não foi possível baixar o arquivo para compartilhar.");
      const blob = await res.blob();
      const name = job?.fileName ?? `${campaignName}.${blob.type.includes("zip") ? "zip" : blob.type.split("/")[1] ?? "bin"}`;
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: campaignName });
      else if (navigator.share) await navigator.share({ title: campaignName, url: new URL(downloadUrl, location.href).toString() });
      else toast("Seu navegador não permite compartilhar arquivos. Use o botão Baixar.", "info");
    } catch (e) { if ((e as Error).name !== "AbortError") toast((e as Error).message, "error"); }
  };
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <Dialog open={open} onClose={onClose} title="Exportar arquivos" size="lg">
      {blockedReason ? <ErrorState title="Ainda não é possível exportar" message={blockedReason} /> : !job ? (
        <div className="flex flex-col gap-4">
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${pkg ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="kind" className="mt-1 h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={pkg} onChange={() => setPkg(true)} />
            <span><span className="block font-semibold">Pacote completo da campanha (ZIP)</span><span className="text-sm text-ink-muted">Todas as peças ativas ({enabledFormats.length}) em pastas: encarte, redes sociais, cartazes, etiquetas, vitrine e TV.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${!pkg ? "border-brand bg-brand-soft" : "border-line"}`}>
            <input type="radio" name="kind" className="mt-1 h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={!pkg} onChange={() => setPkg(false)} />
            <span><span className="block font-semibold">Escolher formatos e tipos de arquivo</span></span>
          </label>
          {!pkg && (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {FORMAT_IDS.map((f) => (
                <li key={f} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-semibold">{FORMATS[f].label}{!enabledFormats.includes(f) && <span className="font-normal text-ink-muted"> (desativada)</span>}</span>
                  <span className="flex gap-4">
                    {FORMATS[f].fileTypes.map((t) => (
                      <Checkbox key={t} label={FT_LABEL[t]} checked={!!sel[key(f, t)]} onChange={(v) => setSel({ ...sel, [key(f, t)]: v })} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasPrint && <Checkbox label="Incluir sangria de 3 mm nos PDFs para gráfica" description="Use só se a gráfica pedir. Para imprimir em casa, deixe desmarcado." checked={bleed} onChange={setBleed} />}
          {error && <ErrorState message={error} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={start} loading={busy} disabled={pkg ? !enabledFormats.length : !chosen.length}>Gerar arquivos</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex items-center gap-3">
            {(job.status === "na_fila" || job.status === "processando") && <span className="h-6 w-6 animate-spin rounded-full border-4 border-brand border-r-transparent" aria-hidden />}
            <p className={`font-semibold ${job.status === "falhou" ? "text-danger" : ""}`} role="status">{job.statusLabel && job.status !== "concluida" ? job.statusLabel : STATUS_TEXT[job.status]}</p>
            {job.campaignVersion != null && <span className="text-xs text-ink-muted">versão {job.campaignVersion} da campanha</span>}
          </div>
          {job.status === "falhou" && <ErrorState title="A exportação falhou" message={job.error ?? "Erro desconhecido."} onRetry={() => setJob(null)} />}
          {job.warnings && job.warnings.length > 0 && <ul className="rounded-xl bg-warning/10 p-3 text-sm">{job.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          {job.status === "concluida" && (
            <>
              {job.resultInfo && job.resultInfo.length > 0 && (
                <ul className="max-h-60 divide-y divide-line overflow-auto rounded-xl border border-line text-sm">
                  {job.resultInfo.map((r) => (
                    <li key={r.path} className="p-2"><span className="block break-all font-medium">{r.path}</span><span className="text-xs text-ink-muted">{describe(r)}</span></li>
                  ))}
                </ul>
              )}
              {job.fileName && <p className="break-all text-xs text-ink-muted">Arquivo: {job.fileName}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                {downloadUrl && <a href={downloadUrl} download={job.fileName ?? true} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-strong">Baixar {job.fileName?.endsWith(".zip") ? "pacote (ZIP)" : "arquivo"}</a>}
                {canShare && <Button variant="secondary" onClick={share}>Compartilhar…</Button>}
                <Button variant="ghost" onClick={() => setJob(null)}>Nova exportação</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
