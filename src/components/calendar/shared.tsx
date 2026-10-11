"use client";
import Link from "next/link";
import type { SVGProps } from "react";
import { cx } from "@/components/ui";
import { STATUS_LABEL, type CampaignStatus } from "@/domain/campaign";
import { dm } from "./dates";

// ---------- Tipos da resposta de GET /api/calendar ----------
export interface CalEvent {
  id: string; name: string; date: string; isMovable: boolean; note: string | null; scope: "global" | "conta"; editable: boolean;
}
export interface CalCampaign {
  id: string; name: string; status: CampaignStatus; startsAt: string | null; endsAt: string | null; storeId: string; storeName: string | null;
}
export interface CalendarData {
  range: { from: string; to: string };
  events: CalEvent[];
  campaigns: CalCampaign[];
  canEdit: boolean;
}
/** Campanha com o período já convertido para dias (AAAA-MM-DD). */
export type PlacedCampaign = CalCampaign & { start: string; end: string };

// ---------- Cores por status (cor + texto: a cor nunca é a única pista) ----------
export const STATUS_STYLE: Record<CampaignStatus, string> = {
  rascunho: "border-l-ink-muted bg-ink/[0.06] text-ink",
  em_revisao: "border-l-warning bg-warning/15 text-ink",
  aprovada: "border-l-brand bg-brand-soft text-brand-strong",
  agendada: "border-l-accent bg-accent/10 text-ink",
  publicada: "border-l-success bg-success/15 text-ink",
  encerrada: "border-l-line-strong bg-surface-alt text-ink-muted",
};
export const STATUS_DOT: Record<CampaignStatus, string> = {
  rascunho: "bg-ink-muted", em_revisao: "bg-warning", aprovada: "bg-brand", agendada: "bg-accent", publicada: "bg-success", encerrada: "bg-line-strong",
};
export const statusLabel = (s: CampaignStatus) => STATUS_LABEL[s] ?? s;

export const periodText = (c: PlacedCampaign) => (c.start === c.end ? dm(c.start) : `${dm(c.start)} a ${dm(c.end)}`);

// ---------- Ícones locais ----------
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });
export const IconChevronLeft = (p: P) => <svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconChevronRight = (p: P) => <svg {...base(p)}><path d="M9 18l6-6-6-6" /></svg>;
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const IconMovable = (p: P) => <svg {...base(p)}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>;
export const IconFlag = (p: P) => <svg {...base(p)}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>;
export const IconPin = (p: P) => <svg {...base(p)}><path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></svg>;

// ---------- Marcadores ----------
export function EventChip({ ev, onClick, compact }: { ev: CalEvent; onClick: () => void; compact?: boolean }) {
  const global = ev.scope === "global";
  return (
    <button type="button" onClick={onClick}
      title={`${ev.name}${global ? " · data comercial" : " · evento da conta"}${ev.isMovable ? " · data móvel" : ""}`}
      className={cx("flex w-full min-w-0 items-center gap-1 rounded-lg text-left font-semibold transition-colors",
        compact ? "min-h-[26px] px-1.5 py-0.5 text-xs" : "min-h-[44px] px-3 py-2 text-sm",
        global ? "bg-highlight/40 text-ink hover:bg-highlight/60" : "border border-brand/40 bg-brand-soft text-brand-strong hover:border-brand")}>
      {global ? <IconFlag size={compact ? 12 : 16} className="shrink-0" /> : <IconPin size={compact ? 12 : 16} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{ev.name}</span>
      {ev.isMovable && <IconMovable size={compact ? 12 : 14} className="shrink-0 opacity-80" />}
      <span className="sr-only">{global ? ", data comercial" : ", evento da conta"}{ev.isMovable ? ", data móvel" : ""}</span>
    </button>
  );
}

export function StatusPill({ status }: { status: CampaignStatus }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full border-l-0 px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>
      <span className={cx("h-2 w-2 rounded-full", STATUS_DOT[status])} aria-hidden />{statusLabel(status)}
    </span>
  );
}

/** Linha de campanha (agenda e diálogos): nome, período, loja e status, com link para a campanha. */
export function CampaignCard({ c }: { c: PlacedCampaign }) {
  return (
    <Link href={`/app/campanhas/${c.id}`}
      className={cx("flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-line border-l-4 p-3 hover:border-brand", STATUS_STYLE[c.status])}>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{c.name}</span>
        <span className="block text-xs text-ink-muted">{periodText(c)}{c.storeName ? ` · ${c.storeName}` : ""}</span>
      </span>
      <StatusPill status={c.status} />
    </Link>
  );
}

export function Legend({ className }: { className?: string }) {
  const statuses: CampaignStatus[] = ["rascunho", "em_revisao", "aprovada", "agendada", "publicada", "encerrada"];
  return (
    <details className={cx("rounded-xl border border-line bg-surface text-sm", className)}>
      <summary className="flex min-h-[44px] cursor-pointer items-center px-3 font-semibold">Legenda</summary>
      <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Campanhas</p>
          <ul className="flex flex-wrap gap-1.5">{statuses.map((s) => <li key={s}><StatusPill status={s} /></li>)}</ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Datas</p>
          <ul className="flex flex-col gap-1.5">
            <li className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-md bg-highlight/40 px-1.5 py-0.5 text-xs font-semibold"><IconFlag size={12} />Data comercial</span> calendário padrão, igual para todos</li>
            <li className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand-strong"><IconPin size={12} />Evento da conta</span> criado pela sua equipe</li>
            <li className="flex items-center gap-2"><IconMovable size={14} /> data móvel, calculada para cada ano</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
