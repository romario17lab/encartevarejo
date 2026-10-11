"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dialog, EmptyState, ErrorState, Input, toast } from "@/components/ui";
import { api, asList, duplicatedId, type CampaignSummary, type DuplicateResult } from "@/lib/client/api";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { useApi } from "@/lib/client/hooks";
import { LoadingBlock, StatusBadge } from "./common";

export function CampaignRow({ c }: { c: CampaignSummary }) {
  return (
    <Link href={`/app/campanhas/${c.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
      <div className="min-w-0">
        <p className="truncate font-semibold">{c.name}</p>
        <p className="text-sm text-ink-muted">
          {c.startsAt || c.endsAt ? `${fmtDate(c.startsAt, { year: false })} a ${fmtDate(c.endsAt)}` : "Sem datas"}
          {c.itemCount != null && ` · ${c.itemCount} ${c.itemCount === 1 ? "produto" : "produtos"}`}
          {c.storeName && ` · ${c.storeName}`}
        </p>
        <p className="text-xs text-ink-muted">Editada em {fmtDateTime(c.updatedAt)}</p>
      </div>
      <StatusBadge status={c.status} />
    </Link>
  );
}

/** "Reutilizar campanha": escolhe uma anterior → duplica → abre no editor. */
export function ReuseCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const q = useApi<unknown>(open ? "/api/campaigns" : null, [open]);
  const [selected, setSelected] = useState<CampaignSummary | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = asList<CampaignSummary>(q.data, "campaigns").sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const duplicate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<DuplicateResult>(`/api/campaigns/${selected.id}/duplicate`, { name: name.trim() || undefined });
      const id = duplicatedId(res);
      toast("Campanha copiada. Agora é só atualizar preços e datas.", "success");
      onClose();
      if (id) router.push(`/app/campanhas/${id}`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Reutilizar uma campanha" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={duplicate} loading={busy} disabled={!selected}>Copiar e abrir no editor</Button>
      </>}>
      <p className="mb-3 text-sm text-ink-muted">A cópia mantém produtos, modelo e personalizações. Ela começa como rascunho: confira preços e datas antes de aprovar.</p>
      {q.loading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : list.length === 0 ? (
        <EmptyState title="Nenhuma campanha ainda" description="Crie sua primeira campanha. Depois ela pode ser reutilizada aqui." action={<Link href="/app/campanhas/nova" className="font-semibold text-brand underline">Criar campanha</Link>} />
      ) : (
        <div role="radiogroup" aria-label="Campanha a reutilizar" className="flex max-h-[45vh] flex-col gap-2 overflow-auto">
          {list.map((c) => (
            <label key={c.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${selected?.id === c.id ? "border-brand bg-brand-soft" : "border-line"}`}>
              <span className="flex min-w-0 items-center gap-3">
                <input type="radio" name="reuse" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={selected?.id === c.id}
                  onChange={() => { setSelected(c); setName(`${c.name} (cópia)`); }} />
                <span className="min-w-0"><span className="block truncate font-semibold">{c.name}</span><span className="text-xs text-ink-muted">{fmtDate(c.startsAt, { year: false })} a {fmtDate(c.endsAt)}</span></span>
              </span>
              <StatusBadge status={c.status} />
            </label>
          ))}
        </div>
      )}
      {selected && <div className="mt-4"><Input label="Nome da nova campanha" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>}
    </Dialog>
  );
}
