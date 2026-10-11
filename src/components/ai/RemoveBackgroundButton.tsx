"use client";
import { useState } from "react";
import { Button, Dialog, ErrorState, toast } from "@/components/ui";
import { api } from "@/lib/client/api";
import { AiBadge, useAiStatus } from "./shared";

// "Remover fundo": cria uma versão NOVA sem fundo (a foto original continua guardada e intacta)
// e deixa o usuário comparar e escolher. Nunca gera nem substitui a embalagem.

interface AssetInfo { id: string; url: string; width: number | null; height: number | null; source: string; parentAssetId: string | null }
interface Result { requestId: string | null; reused: boolean; original: AssetInfo; result: AssetInfo }

const CHECKER = { backgroundImage: "conic-gradient(#e5e7eb 25%, #fff 0 50%, #e5e7eb 0 75%, #fff 0)", backgroundSize: "16px 16px" };

export function RemoveBackgroundButton({ assetId, onChoose }: { assetId: string | null | undefined; onChoose: (a: { id: string; url: string }) => void }) {
  const status = useAiStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  if (!assetId) return null;
  const configured = status.data?.configured.backgroundRemoval;

  const run = async () => {
    setOpen(true); setBusy(true); setError(null); setRes(null);
    try { setRes(await api.post<Result>("/api/ai/remove-background", { assetId })); void status.reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const choose = async (which: "original" | "result") => {
    if (!res) return;
    if (which === "result") { onChoose({ id: res.result.id, url: res.result.url }); toast("Versão sem fundo selecionada. Salve o produto para aplicar.", "success"); }
    if (res.requestId) await api.post(`/api/ai/requests/${res.requestId}`, { status: which === "result" ? "revisada" : "descartada" }).catch(() => {});
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={run} disabled={!configured || busy} loading={busy}>Remover fundo</Button>
        <AiBadge />
      </div>
      {status.data && !configured && <p className="text-xs text-ink-muted">Remoção de fundo: não configurada. A foto continua como foi enviada.</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Remover fundo" size="lg"
        footer={res ? <>
          <Button variant="secondary" onClick={() => choose("original")}>Manter a original</Button>
          <Button onClick={() => choose("result")}>Usar sem fundo</Button>
        </> : undefined}>
        {busy && <p role="status" className="text-sm">Removendo o fundo… isso pode levar alguns segundos.</p>}
        {error && <ErrorState message={error} />}
        {res && (
          <>
            <p className="mb-3 text-sm text-ink-muted">Compare e escolha. A foto original continua guardada e não foi alterada. A versão sem fundo foi criada a partir da sua própria foto (origem registrada: remoção de fundo por IA).</p>
            <div className="grid grid-cols-2 gap-3">
              {([["Original", res.original], ["Sem fundo", res.result]] as const).map(([label, a]) => (
                <figure key={label} className="flex flex-col gap-1">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-line" style={CHECKER}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={`${label}`} className="max-h-full max-w-full object-contain" />
                  </div>
                  <figcaption className="text-center text-sm font-semibold">{label}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">Confira se a embalagem ficou inteira e sem recortes errados antes de usar.</p>
          </>
        )}
      </Dialog>
    </div>
  );
}
