"use client";
import { useState } from "react";
import { Button, Dialog, EmptyState, ErrorState, toast } from "@/components/ui";
import { confirmAction, LoadingBlock } from "@/components/app/common";
import { FORMATS, type FormatId } from "@/domain/formats";
import { api, asList, type CampaignVersion } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useApi } from "@/lib/client/hooks";

/** Histórico de versões: lista e restauração (a restauração cria uma versão nova). */
export function VersionsDrawer({ open, onClose, campaignId, currentVersion, canRestore, beforeRestore, onRestored }: {
  open: boolean; onClose: () => void; campaignId: string; currentVersion: number; canRestore: boolean; beforeRestore: () => Promise<void>; onRestored: () => Promise<void>;
}) {
  const q = useApi<unknown>(open ? `/api/campaigns/${campaignId}/versions` : null, [open, currentVersion]);
  const [busy, setBusy] = useState<number | null>(null);
  const list = asList<CampaignVersion>(q.data, "versions").sort((a, b) => b.version - a.version);
  const restore = async (v: number) => {
    if (!confirmAction(`Restaurar a versão ${v}? O conteúdo atual continua no histórico.`)) return;
    setBusy(v);
    try {
      await beforeRestore();
      await api.post(`/api/campaigns/${campaignId}/versions/${v}/restore`, {});
      toast(`Versão ${v} restaurada.`, "success");
      await onRestored(); onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Histórico de versões">
      {q.loading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : list.length === 0 ? (
        <EmptyState title="Nenhuma versão salva ainda" description="Cada salvamento com mudança de conteúdo cria uma versão." />
      ) : (
        <ol className="flex flex-col gap-2">
          {list.map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0">
                <p className="font-semibold">Versão {v.version} {v.version === currentVersion && <span className="text-xs font-normal text-brand">(atual)</span>}</p>
                <p className="text-xs text-ink-muted">{fmtDateTime(v.createdAt)}{v.createdByName ? ` · ${v.createdByName}` : ""}{v.reason ? ` · ${v.reason}` : ""}</p>
              </div>
              {canRestore && v.version !== currentVersion && <Button size="sm" variant="secondary" loading={busy === v.version} onClick={() => restore(v.version)}>Restaurar</Button>}
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

export interface WarningEntry { level: "error" | "warning"; message: string; itemId?: string; format?: FormatId; source: "oferta" | "layout" | "encaixe" | "servidor" }

/** Painel de avisos: validação de ofertas + avisos do layout + medição de encaixe na prévia. */
export function WarningsPanel({ warnings, onSelectItem, onSelectFormat, itemNames }: {
  warnings: WarningEntry[]; onSelectItem: (id: string) => void; onSelectFormat: (f: FormatId) => void; itemNames: Record<string, string>;
}) {
  const errors = warnings.filter((w) => w.level === "error");
  const warns = warnings.filter((w) => w.level === "warning");
  if (!warnings.length) return <p role="status" className="rounded-xl bg-success/10 p-3 text-sm font-semibold text-success">Nenhum problema encontrado.</p>;
  const Row = ({ w }: { w: WarningEntry }) => (
    <li className={`rounded-xl border p-2 text-sm ${w.level === "error" ? "border-danger/40 bg-danger/5" : "border-warning/50 bg-warning/5"}`}>
      <p>{w.itemId && itemNames[w.itemId] && w.source === "oferta" ? <strong>{itemNames[w.itemId]}: </strong> : null}{w.message}</p>
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        {w.format && <button className="font-semibold text-brand underline" onClick={() => onSelectFormat(w.format!)}>Ver {FORMATS[w.format].label}</button>}
        {w.itemId && itemNames[w.itemId] && <button className="font-semibold text-brand underline" onClick={() => onSelectItem(w.itemId!)}>Editar produto</button>}
      </div>
    </li>
  );
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {errors.length > 0 && <section><h3 className="mb-1 text-sm font-bold text-danger">Erros ({errors.length}) — bloqueiam aprovação e exportação</h3><ul className="flex flex-col gap-1.5">{errors.map((w, i) => <Row key={i} w={w} />)}</ul></section>}
      {warns.length > 0 && <section><h3 className="mb-1 text-sm font-bold">Avisos ({warns.length})</h3><ul className="flex flex-col gap-1.5">{warns.map((w, i) => <Row key={i} w={w} />)}</ul></section>}
    </div>
  );
}
