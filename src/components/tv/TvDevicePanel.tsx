"use client";
// Conexão do aparelho: código de pareamento (15 min, uso único), link secreto do player e desconexão.
import { useEffect, useState } from "react";
import { Button, toast } from "@/components/ui";
import { confirmAction } from "@/components/app/common";
import { api, ApiError } from "@/lib/client/api";
import type { TvScreenView } from "./types";

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
}

export function PairingCode({ code, expiresAt }: { code: string; expiresAt: string }) {
  const left = useCountdown(expiresAt);
  const expired = left !== null && left <= 0;
  return (
    <div className="rounded-2xl border border-line bg-surface-alt p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Código de pareamento</p>
      <p data-tv-code="" className={`mt-1 font-mono text-4xl font-extrabold tracking-[0.25em] ${expired ? "text-ink-muted line-through" : "text-ink"}`} aria-label={code.split("").join(" ")}>{code}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {expired ? "Código vencido. Gere outro." : `Vence em ${Math.floor((left ?? 0) / 60)}:${String((left ?? 0) % 60).padStart(2, "0")} · uso único`}
      </p>
    </div>
  );
}

export function TvDevicePanel({ screen, canWrite, onChanged }: { screen: TvScreenView; canWrite: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } catch (e) { toast(e instanceof ApiError ? e.message : "Não foi possível concluir.", "error"); } finally { setBusy(null); }
  };
  const newCode = () => run("code", async () => { await api.post(`/api/tv/screens/${screen.id}/pairing`); onChanged(); });
  const newLink = () => {
    if (screen.paired && !confirmAction("Gerar o link substitui o aparelho conectado agora (ele para na próxima sincronização). Continuar?")) return;
    void run("link", async () => {
      const r = await api.post<{ path: string }>(`/api/tv/screens/${screen.id}/link`);
      setLink(`${window.location.origin}${r.path}`);
      onChanged();
    });
  };
  const revoke = () => {
    if (!confirmAction(`Desconectar o aparelho da tela "${screen.name}"? Ele para de tocar na próxima sincronização (até 1 minuto).`)) return;
    void run("revoke", async () => { await api.post(`/api/tv/screens/${screen.id}/revoke`); setLink(null); toast("Aparelho desconectado.", "success"); onChanged(); });
  };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); toast("Link copiado.", "success"); } catch { toast("Selecione o link e copie manualmente.", "info"); }
  };

  return (
    <div className="flex flex-col gap-3">
      {screen.pairingCode && screen.pairingExpiresAt ? (
        <PairingCode code={screen.pairingCode} expiresAt={screen.pairingExpiresAt} />
      ) : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>Na TV, abra o navegador em <b className="break-all text-ink">{origin || ""}/tv</b></li>
        <li>Digite o código acima com o controle remoto ou o teclado.</li>
        <li>TV sem teclado? Use o <b className="text-ink">link do player</b>: abra o link uma vez na TV e salve nos favoritos.</li>
      </ol>
      {link && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
          <p className="font-semibold">Link do player (aparece só agora):</p>
          <p className="mt-1 break-all font-mono text-xs">{link}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void copy()}>Copiar link</Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Quem tiver o link vê a programação desta tela. Para invalidar, use “Desconectar aparelho”.</p>
        </div>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === "code"} onClick={() => void newCode()}>{screen.pairingCode ? "Gerar novo código" : "Gerar código de pareamento"}</Button>
          <Button size="sm" variant="secondary" loading={busy === "link"} onClick={newLink}>Gerar link do player</Button>
          {screen.paired && <Button size="sm" variant="danger" loading={busy === "revoke"} onClick={revoke}>Desconectar aparelho</Button>}
        </div>
      )}
    </div>
  );
}
