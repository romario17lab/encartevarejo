"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button, cx, ErrorState, Input, toast } from "@/components/ui";
import { LoadingBlock, StatusBadge } from "@/components/app/common";
import { IconCopy, IconDownload } from "@/components/app/icons";
import { api, type ApiError, type EditorState } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { normalizeOrigin, ORIGIN_OPTIONS, storefrontLink, type OriginOption } from "./origins";

// Painel "Divulgar campanha": link público da vitrine, link de campanha com origem (?campanha=&origem=),
// cópia, compartilhamento nativo e QR code (PNG/SVG). Só usa dados públicos (nunca custo ou margem).

const IconShare = ({ size = 18 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </svg>
);

interface ShareInfo {
  id: string; name: string; status: EditorState["campaign"]["status"];
  startsAt: string | null; endsAt: string | null; scheduledPublishAt: string | null; publishedVersion: number | null;
  store: { name: string; slug: string | null; storefrontEnabled: boolean };
}

function toInfo(s: EditorState): ShareInfo {
  const st = s.store as EditorState["store"] & { storefrontEnabled?: boolean };
  return {
    id: s.campaign.id, name: s.campaign.name, status: s.campaign.status, startsAt: s.campaign.startsAt, endsAt: s.campaign.endsAt,
    scheduledPublishAt: s.campaign.scheduledPublishAt ?? null, publishedVersion: s.campaign.publishedVersion ?? null,
    store: { name: st?.name ?? "", slug: st?.slug ?? null, storefrontEnabled: st?.storefrontEnabled !== false },
  };
}

/** Copia texto; sem permissão de área de transferência, seleciona o campo para cópia manual. */
async function copyText(text: string, fallbackInput?: HTMLInputElement | null, okMsg = "Link copiado.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, "success");
  } catch {
    if (fallbackInput) { fallbackInput.focus(); fallbackInput.select(); }
    toast("Não foi possível copiar automaticamente. O link está selecionado: copie manualmente.", "info");
  }
}

function slugFile(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "campanha";
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

function LinkField({ label, value, hint, onCopy, inputRef }: { label: string; value: string; hint?: string; onCopy: () => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} ref={inputRef} readOnly value={value} onFocus={(e) => e.currentTarget.select()}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-11 w-full min-w-0 rounded-xl border border-line-strong/70 bg-surface-alt px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25" />
        <Button variant="secondary" icon={<IconCopy size={18} />} onClick={onCopy} className="shrink-0">Copiar</Button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Aviso sobre quando o link mostra as ofertas desta campanha. */
function StatusNote({ info }: { info: ShareInfo }) {
  const now = Date.now();
  let tone: "info" | "warning" = "warning";
  let text: string;
  if (!info.store.storefrontEnabled) {
    return (
      <div role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
        A vitrine online da loja <strong>{info.store.name}</strong> está desativada: quem abrir o link verá “página não encontrada”.{" "}
        <Link href="/app/loja" className="font-semibold underline">Ativar a vitrine</Link>
      </div>
    );
  }
  if (info.status === "publicada" && info.publishedVersion != null) {
    if (info.startsAt && new Date(info.startsAt).getTime() > now) text = `Publicada. As ofertas aparecem no link a partir de ${fmtDateTime(info.startsAt)}.`;
    else if (info.endsAt && new Date(info.endsAt).getTime() < now) text = "A validade terminou: o link abre a vitrine da loja com as outras ofertas em vigor.";
    else { tone = "info"; text = "Publicada: o link mostra as ofertas desta campanha agora."; }
  } else if (info.status === "agendada") {
    tone = "info";
    text = info.scheduledPublishAt
      ? `Publicação agendada para ${fmtDateTime(info.scheduledPublishAt)}. Você já pode divulgar o link: as ofertas aparecem nele a partir da publicação.`
      : "Publicação agendada. As ofertas aparecem no link a partir da publicação.";
  } else if (info.status === "encerrada") {
    text = "Campanha encerrada: o link abre a vitrine da loja com as outras ofertas em vigor (ou o aviso de que não há ofertas).";
  } else {
    text = "Esta campanha ainda não foi publicada. Você já pode copiar o link, mas ele só mostra estas ofertas depois da publicação. Até lá, quem abrir verá a vitrine da loja com as ofertas em vigor.";
  }
  return <p role="note" className={cx("rounded-xl border p-3 text-sm", tone === "info" ? "border-brand/30 bg-brand-soft" : "border-warning/40 bg-warning/10")}>{text}</p>;
}

/** Conteúdo do painel (sem diálogo) — pode ser usado dentro de uma aba ou diálogo do editor. */
export function SharePanel({ campaignId, storefrontBase }: { campaignId: string; storefrontBase: string }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [origin, setOrigin] = useState<OriginOption>("whatsapp");
  const [other, setOther] = useState("");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const storeRef = useRef<HTMLInputElement>(null);
  const campRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);
  const groupId = useId();

  const load = useCallback(async () => {
    setError(null);
    try { setInfo(toInfo(await api.get<EditorState>(`/api/campaigns/${campaignId}`))); }
    catch (e) { setError(e as ApiError); }
  }, [campaignId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"); }, []);

  const slug = info?.store.slug ?? null;
  const originValue = origin === "outro" ? normalizeOrigin(other) : origin;
  const storeUrl = slug ? storefrontLink(storefrontBase, slug) : "";
  const campaignUrl = slug ? storefrontLink(storefrontBase, slug, { campaignId, origin: originValue }) : "";
  const qrUrl = slug ? storefrontLink(storefrontBase, slug, { campaignId, origin: "qr" }) : "";

  useEffect(() => {
    if (!qrUrl) return;
    let alive = true;
    QRCode.toString(qrUrl, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } })
      .then((s) => { if (alive) setQrSvg(s); })
      .catch(() => { if (alive) setQrSvg(null); });
    return () => { alive = false; };
  }, [qrUrl]);

  if (error) return <ErrorState title={error.status === 404 ? "Campanha não encontrada" : "Não foi possível carregar o link"} message={error.message} onRetry={error.status === 404 ? undefined : load} />;
  if (!info) return <LoadingBlock label="Preparando os links…" />;
  if (!slug) return <ErrorState title="Loja sem endereço público" message="Esta loja ainda não tem um endereço de vitrine. Confira os dados em Loja." />;

  const fileBase = `qr-${slugFile(info.store.name)}-${slugFile(info.name)}`;
  const share = async () => {
    const data = { title: `Ofertas ${info.store.name}`, text: `Confira as ofertas do ${info.store.name}`, url: campaignUrl };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await copyText(campaignUrl, campRef.current);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") await copyText(campaignUrl, campRef.current);
    }
  };
  const downloadPng = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(qrUrl, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });
      download(dataUrl, `${fileBase}.png`);
    } catch { toast("Não foi possível gerar o PNG do QR code.", "error"); }
  };
  const downloadSvg = () => {
    if (!qrSvg) return;
    const url = URL.createObjectURL(new Blob([qrSvg], { type: "image/svg+xml" }));
    download(url, `${fileBase}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{info.name}</span><StatusBadge status={info.status} />
        <span className="text-ink-muted">· {info.store.name}</span>
      </div>
      <StatusNote info={info} />

      <LinkField label="Link da vitrine da loja" value={storeUrl} inputRef={storeRef}
        hint="Mostra todas as ofertas publicadas e em vigor da loja."
        onCopy={() => void copyText(storeUrl, storeRef.current)} />

      <section aria-labelledby={`${groupId}-t`} className="flex flex-col gap-3 rounded-2xl border border-line p-3 sm:p-4">
        <div>
          <h3 id={`${groupId}-t`} className="font-display text-base font-bold">Link desta campanha</h3>
          <p className="text-xs text-ink-muted">Escolha onde vai divulgar. Assim, em Métricas, você vê de onde vieram os acessos.</p>
        </div>
        <fieldset>
          <legend className="sr-only">Onde você vai divulgar</legend>
          <div className="flex flex-wrap gap-2">
            {ORIGIN_OPTIONS.map((o) => (
              <label key={o.value} className={cx("inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-brand/40",
                origin === o.value ? "border-ink bg-ink text-white" : "border-line-strong/70 bg-surface hover:bg-surface-alt")}>
                <input type="radio" name={`${groupId}-origem`} value={o.value} checked={origin === o.value} onChange={() => setOrigin(o.value)} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {origin === "outro" && (
          <Input label="Nome da origem" value={other} maxLength={60} onChange={(e) => setOther(e.target.value)} placeholder="ex.: panfleto do bairro, rádio, e-mail"
            hint={originValue ? `Vai aparecer nas métricas como “${originValue}”.` : "Sem nome, o link fica sem origem (conta como acesso direto)."} />
        )}
        <LinkField label="Link para divulgar" value={campaignUrl} inputRef={campRef} onCopy={() => void copyText(campaignUrl, campRef.current)} />
        {canShare && (
          <Button icon={<IconShare />} onClick={() => void share()} className="self-start">Compartilhar…</Button>
        )}
      </section>

      <section aria-labelledby={`${groupId}-qr`} className="grid gap-4 rounded-2xl border border-line p-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-4">
        <div className="mx-auto w-44 sm:mx-0 sm:w-full">
          {qrSvg
            ? <div role="img" aria-label={`QR code que abre: ${qrUrl}`} className="overflow-hidden rounded-xl border border-line bg-white [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            : <div className="flex aspect-square items-center justify-center rounded-xl border border-line text-xs text-ink-muted">Gerando QR code…</div>}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <h3 id={`${groupId}-qr`} className="font-display text-base font-bold">QR code para cartaz e encarte</h3>
            <p className="text-xs text-ink-muted">Os acessos por este QR code aparecem nas métricas como “Cartaz / QR code”. Imprima com pelo menos 2 cm de lado.</p>
          </div>
          <LinkField label="Endereço do QR code" value={qrUrl} inputRef={qrRef} onCopy={() => void copyText(qrUrl, qrRef.current)} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" icon={<IconDownload size={18} />} onClick={() => void downloadPng()}>Baixar PNG</Button>
            <Button variant="secondary" icon={<IconDownload size={18} />} onClick={downloadSvg} disabled={!qrSvg}>Baixar SVG</Button>
          </div>
        </div>
      </section>

      <p className="text-xs text-ink-muted">
        Contamos visitas à vitrine, compartilhamentos e cliques no WhatsApp, sem identificar pessoas. Clique no WhatsApp mostra interesse do cliente, não é venda.{" "}
        <Link href="/app/metricas" className="font-semibold text-brand underline">Ver métricas</Link>
      </p>
    </div>
  );
}
