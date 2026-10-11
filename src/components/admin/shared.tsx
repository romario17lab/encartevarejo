"use client";
// Peças compartilhadas da administração da plataforma.
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cx, EmptyState, ErrorState } from "@/components/ui";
import { LoadingBlock } from "@/components/app/common";
import type { Query } from "@/lib/client/hooks";
import { formatBRL } from "@/domain/money";

export function AdminPageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && <Link href={back.href} className="mb-2 inline-flex min-h-[32px] items-center text-sm font-semibold text-ink-muted hover:text-ink">‹ {back.label}</Link>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h1>
          {description && <div className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Carregando / erro / vazio padronizados. */
export function QueryView<T>({ q, empty, isEmpty, children, loadingLabel }: {
  q: Query<T>; empty?: { title: string; description?: string }; isEmpty?: (d: T) => boolean; children: (d: T) => ReactNode; loadingLabel?: string;
}) {
  if (q.loading && q.data === undefined) return <LoadingBlock label={loadingLabel ?? "Carregando…"} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => void q.reload()} />;
  if (q.data === undefined) return null;
  if (empty && isEmpty?.(q.data)) return <EmptyState title={empty.title} description={empty.description} />;
  return <>{children(q.data)}</>;
}

export function StatCard({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warning" | "success"; href?: string }) {
  const body = (
    <div className={cx("h-full rounded-2xl border bg-surface p-4 shadow-card", tone === "danger" ? "border-danger/40" : tone === "warning" ? "border-warning/60" : "border-line", href && "transition hover:border-brand")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cx("mt-1 font-display text-2xl font-extrabold ev-num", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** Tabela com rolagem horizontal própria (a página nunca rola de lado). */
export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export const th = "whitespace-nowrap border-b border-line bg-surface-alt px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted";
export const td = "border-b border-line px-3 py-2 align-top";

/** Barra de uso em relação ao limite. pct null = há uso com limite 0. */
export function Meter({ pct, label }: { pct: number | null; label: string }) {
  const v = pct == null ? 100 : Math.min(100, pct);
  const tone = pct == null || pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand";
  return (
    <div className="mt-1 h-1.5 w-full min-w-[60px] overflow-hidden rounded-full bg-ink/10" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <div className={cx("h-full rounded-full", tone)} style={{ width: `${v}%` }} />
    </div>
  );
}

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
export const fmtMb = (bytes: number) => {
  const mb = bytes / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
};
export const fmtLimitMb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : `${mb.toLocaleString("pt-BR")} MB`);
export const fmtPrice = (cents: number | null | undefined) => (cents == null ? "Valor a definir" : `${formatBRL(cents)}/mês`);
export const fmtPctText = (p: number | null) => (p == null ? "sem limite no plano" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export const SUB_STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "accent" }> = {
  teste: { label: "Em teste", tone: "brand" },
  ativa: { label: "Ativa", tone: "success" },
  inadimplente: { label: "Inadimplente", tone: "warning" },
  cancelada: { label: "Cancelada", tone: "neutral" },
  encerrada: { label: "Encerrada", tone: "neutral" },
};
export function SubStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>Sem assinatura</Badge>;
  const s = SUB_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Detalhes JSON compactos (já sem dados sensíveis, filtrados no servidor). */
export function DetailsText({ data }: { data: unknown }) {
  if (!data || (typeof data === "object" && !Object.keys(data as object).length)) return <span className="text-ink-muted">—</span>;
  const entries: Array<[string, unknown]> = typeof data === "object" ? Object.entries(data as Record<string, unknown>) : [["valor", data]];
  return (
    <dl className="grid gap-x-2 text-xs [grid-template-columns:auto_1fr]">
      {entries.slice(0, 12).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-ink-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FilterBar({ children, onSubmit }: { children: ReactNode; onSubmit?: () => void }) {
  return (
    <form className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }} role="search">
      {children}
    </form>
  );
}
