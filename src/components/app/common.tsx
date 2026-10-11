"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Badge, Button, cx, Input, Spinner, toast } from "@/components/ui";
import { STATUS_LABEL, type CampaignStatus } from "@/domain/campaign";
import { api, type Asset } from "@/lib/client/api";
import { IconBack, IconImage, IconUpload } from "./icons";

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
          <IconBack size={16} />{back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {description && <div className="mt-1 text-sm text-ink-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STATUS_TONE: Record<CampaignStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "accent"> = {
  rascunho: "neutral", em_revisao: "warning", aprovada: "brand", agendada: "accent", publicada: "success", encerrada: "neutral",
};
export function StatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 py-12 text-ink-muted"><Spinner label={label} /><span>{label}</span></div>;
}

/** Miniatura de imagem do produto, com marcador quando não há foto. */
export function Thumb({ url, alt, size = 56, className }: { url: string | null | undefined; alt: string; size?: number; className?: string }) {
  return (
    <div className={cx("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-alt", className)} style={{ width: size, height: size }}>
      {url ? <img src={url} alt={alt} className="h-full w-full object-contain" loading="lazy" /> : <span className="text-ink-muted" title="Sem foto"><IconImage size={Math.round(size * 0.4)} />{alt && <span className="sr-only">Sem foto</span>}</span>}
    </div>
  );
}

/**
 * Envio de imagem para POST /api/assets (source "upload_lojista"), com observação de origem.
 * O servidor valida o conteúdo (JPEG/PNG/WebP até 8 MB) e normaliza com sharp.
 */
export function ImageUpload({ label, value, onUploaded, onClear, defaultNote = "", noteLabel = "Origem da imagem", compact }: {
  label: string; value: string | null; onUploaded: (a: Asset) => void; onClear?: () => void; defaultNote?: string; noteLabel?: string; compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(defaultNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Envie uma imagem JPEG, PNG ou WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("A imagem tem mais de 8 MB. Reduza o tamanho e tente de novo."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", "upload_lojista");
      fd.append("sourceNote", note.trim() || "Foto enviada pelo lojista");
      const a = await api.upload<Asset>("/api/assets", fd);
      onUploaded(a);
      toast("Imagem enviada.", "success");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <Thumb url={value} alt={label} size={compact ? 56 : 88} />
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id={`up-${label}`}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button type="button" variant="secondary" size="sm" loading={busy} icon={<IconUpload size={16} />} onClick={() => fileRef.current?.click()}>
            {value ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {value && onClear && <Button type="button" variant="ghost" size="sm" onClick={onClear}>Remover</Button>}
        </div>
      </div>
      {!compact && <Input label={noteLabel} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: foto tirada na loja, imagem enviada pelo fornecedor" hint="Registramos de onde veio a imagem. Use só imagens que você tem direito de usar." />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="mb-3 mt-6 flex items-center justify-between gap-2"><h2 className="font-display text-lg font-bold">{children}</h2>{aside}</div>;
}

export function Checkbox({ label, checked, onChange, description, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; description?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", disabled && "opacity-50")}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--ev-brand))]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="text-sm font-medium">{label}</span>{description && <span className="block text-xs text-ink-muted">{description}</span>}</span>
    </label>
  );
}

/** Confirmação para ações destrutivas simples. */
export function confirmAction(msg: string) { return typeof window !== "undefined" ? window.confirm(msg) : false; }
