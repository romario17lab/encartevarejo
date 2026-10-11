"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Dialog, Input, Select, toast } from "@/components/ui";
import { IconCopy, IconShare } from "@/components/app/icons";
import { api } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useMe, safeStorage } from "@/lib/client/hooks";

// Aprovação do cliente por link (Editor: um botão no menu "Ações" + este diálogo).
// O botão e o diálogo conversam por um evento de janela para não exigir estado novo no Editor.

const OPEN_EVENT = "ev:preview-links-open";
const STATE_EVENT = "ev:preview-links-state";
/** última resposta conhecida (o botão do menu é montado só quando o menu abre) */
let lastDecision: { campaignId: string; decision: Decision | null } | null = null;

type Decision = "aprovado" | "alteracoes";
interface LinkRow {
  id: string; campaignVersion: number; expiresAt: string; revokedAt: string | null; viewCount: number;
  decision: Decision | null; decidedAt: string | null; decidedName: string | null; comment: string | null;
  createdAt: string; createdByName: string | null; hasPin: boolean; outdated: boolean;
  status: "ativo" | "expirado" | "revogado" | "aprovado" | "alteracoes" | "desatualizado";
}
interface LinksResponse { campaignVersion: number; links: LinkRow[]; currentDecision: LinkRow | null }

const STATUS: Record<LinkRow["status"], { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "accent" }> = {
  ativo: { label: "Aguardando resposta", tone: "brand" },
  expirado: { label: "Expirado", tone: "neutral" },
  revogado: { label: "Revogado", tone: "neutral" },
  aprovado: { label: "Cliente aprovou", tone: "success" },
  alteracoes: { label: "Cliente pediu alterações", tone: "warning" },
  desatualizado: { label: "Desatualizado", tone: "neutral" },
};

/** Item do menu "Ações" do editor. Mostra a resposta do cliente sobre a versão atual, se houver. */
export function PreviewLinksButton({ onOpen }: { onOpen?: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(() => lastDecision?.decision ?? null);
  useEffect(() => {
    const on = (e: Event) => setDecision((e as CustomEvent<{ decision: Decision | null }>).detail?.decision ?? null);
    window.addEventListener(STATE_EVENT, on);
    return () => window.removeEventListener(STATE_EVENT, on);
  }, []);
  return (
    <Button variant="secondary" icon={<IconShare size={18} />} onClick={() => { onOpen?.(); window.dispatchEvent(new Event(OPEN_EVENT)); }}>
      Aprovação do cliente por link
      {decision && <Badge tone={decision === "aprovado" ? "success" : "warning"}>{decision === "aprovado" ? "aprovou" : "pediu alterações"}</Badge>}
    </Button>
  );
}

export function PreviewLinksDialog({ campaignId, beforeCreate }: { campaignId: string; beforeCreate?: () => Promise<void> }) {
  const { can } = useMe();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LinksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("7");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; pin: string | null; expiresAt: string } | null>(null);
  const canCreate = can("campaigns.submit");

  const load = useCallback(async (announce = false) => {
    try {
      const r = await api.get<LinksResponse>(`/api/preview-links?campaignId=${encodeURIComponent(campaignId)}`);
      setData(r); setError(null);
      const d = r.currentDecision;
      lastDecision = { campaignId, decision: d?.decision ?? null };
      window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: { decision: d?.decision ?? null } }));
      // avisa uma vez por decisão (neste aparelho) quando o cliente respondeu sobre a versão atual
      if (announce && d?.decision) {
        const key = `ev.pvSeen.${d.id}`;
        const st = safeStorage();
        if (!st?.getItem(key)) {
          st?.setItem(key, "1");
          toast(d.decision === "aprovado" ? `Cliente aprovou esta versão por link (${d.decidedName}). A aprovação interna continua necessária.` : `Cliente pediu alterações (${d.decidedName}): ${d.comment ?? ""}`, d.decision === "aprovado" ? "success" : "info");
        }
      }
    } catch (e) { setError((e as Error).message); }
  }, [campaignId]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const on = () => { setOpen(true); setCreated(null); void load(); };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await beforeCreate?.();
      const r = await api.post<{ url: string; expiresAt: string }>("/api/preview-links", { campaignId, days: Number(days), pin: pin || undefined });
      setCreated({ url: r.url, pin: pin || null, expiresAt: r.expiresAt });
      setPin("");
      await load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (!window.confirm("Revogar este link? O cliente não conseguirá mais abrir a prévia.")) return;
    try { await api.del(`/api/preview-links/${id}`); toast("Link revogado.", "success"); await load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast("Link copiado.", "success"); }
    catch { toast("Não foi possível copiar. Selecione o link e copie manualmente.", "error"); }
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Aprovação do cliente por link" size="lg">
      <p className="text-sm text-ink-muted">
        Envie ao cliente um link com as peças <strong>desta versão</strong>. Ele digita o nome e aprova ou pede alterações.
        É um registro da concordância do cliente: a publicação continua dependendo da aprovação interna no aplicativo.
        Se a campanha mudar, o link fica desatualizado e não aceita resposta.
      </p>

      {canCreate && (
        <div className="mt-4 rounded-2xl border border-line p-3">
          {created ? (
            <div className="flex flex-col gap-2" role="status">
              <p className="text-sm font-semibold">Link criado. Copie agora: ele não será mostrado de novo.</p>
              <div className="flex gap-2">
                <input readOnly value={created.url} aria-label="Link da prévia" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-alt px-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" icon={<IconCopy size={16} />} onClick={() => copy(created.url)}>Copiar</Button>
              </div>
              <p className="text-xs text-ink-muted">Válido até {fmtDateTime(created.expiresAt)}.{created.pin ? ` Envie o PIN ${created.pin} por outro canal (ex.: ligação ou mensagem separada).` : ""}</p>
              <div><Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Criar outro link</Button></div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Select label="Validade" value={days} onChange={(e) => setDays(e.target.value)}
                options={[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => ({ value: String(d), label: `${d} dia${d > 1 ? "s" : ""}` }))} />
              <Input label="PIN (opcional)" inputMode="numeric" maxLength={6} placeholder="4 a 6 números" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} error={pin && pin.length < 4 ? "Use de 4 a 6 números." : null} />
              <Button loading={busy} disabled={!!pin && pin.length < 4} onClick={create}>Criar link</Button>
            </div>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 font-display text-base font-bold">Links enviados</h3>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {data && !data.links.length && <p className="text-sm text-ink-muted">Nenhum link criado para esta campanha.</p>}
      <ul className="flex flex-col gap-2">
        {data?.links.map((l) => (
          <li key={l.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
              <span className="text-ink-muted">Versão {l.campaignVersion}{l.campaignVersion === data.campaignVersion ? " (atual)" : ""}</span>
              {l.hasPin && <Badge>com PIN</Badge>}
              <span className="ml-auto text-xs text-ink-muted">{l.viewCount} visualizaç{l.viewCount === 1 ? "ão" : "ões"}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">Criado {fmtDateTime(l.createdAt)}{l.createdByName ? ` por ${l.createdByName}` : ""} · expira {fmtDateTime(l.expiresAt)}</p>
            {l.decision && (
              <p className="mt-2 rounded-lg bg-surface-alt p-2">
                <strong>{l.decidedName}</strong> {l.decision === "aprovado" ? "aprovou" : "pediu alterações"} em {fmtDateTime(l.decidedAt)}{l.comment ? `: ${l.comment}` : "."}
              </p>
            )}
            {canCreate && l.status === "ativo" && (
              <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>Revogar</Button></div>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
