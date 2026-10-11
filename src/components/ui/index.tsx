"use client";
// Componentes base da interface. API estável: o Agente de Design pode refinar o visual
// (classes, variantes, acessibilidade) mas não deve remover props existentes.
import { clsx } from "clsx";
import {
  forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";

export const cx = clsx;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type ButtonSize = "sm" | "md" | "lg";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode; block?: boolean;
}
const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-strong active:bg-brand-strong",
  accent: "bg-accent text-white shadow-sm hover:brightness-95 active:brightness-90",
  secondary: "bg-surface text-ink border border-line-strong/60 hover:bg-surface-alt active:bg-ink/5",
  ghost: "bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10",
  danger: "bg-danger text-white shadow-sm hover:brightness-95 active:brightness-90",
};
// "sm" mantém 36 px de altura visual com área de toque ampliada; md/lg ≥ 44 px
const BTN_SIZES: Record<ButtonSize, string> = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-13 px-6 text-base" };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, ...rest }, ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx("inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        BTN_VARIANTS[variant], BTN_SIZES[size], block && "w-full", className)} {...rest}>
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ size = 20, label = "Carregando" }: { size?: number; label?: string }) {
  return <span role="status" aria-label={label} className="inline-block animate-spin rounded-full border-2 border-current border-r-transparent" style={{ width: size, height: size }} />;
}

interface FieldProps { label?: string; hint?: string; error?: string | null; required?: boolean }
function FieldWrap({ id, label, hint, error, required, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-ink">{label}{required && <span className="text-danger"> *</span>}</label>}
      {children}
      {error ? <p id={`${id}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
const inputCls = (error?: string | null) => cx("h-11 w-full rounded-xl border bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted transition-colors focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none disabled:bg-surface-alt disabled:text-ink-muted", error ? "border-danger" : "border-line-strong/70");

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, required, id, className, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} required={required}>
      <input ref={ref} id={fid} required={required} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} className={cx(inputCls(error), className)} {...rest} />
    </FieldWrap>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, required, id, className, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} required={required}>
      <textarea ref={ref} id={fid} required={required} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} className={cx(inputCls(error), "h-auto min-h-[96px] py-2", className)} {...rest} />
    </FieldWrap>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: Array<{ value: string; label: string }> };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, required, id, options, className, ...rest }, ref) {
  const auto = useId(); const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} required={required}>
      <select ref={ref} id={fid} required={required} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} className={cx(inputCls(error), className)} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldWrap>
  );
});

/** Campo de preço em reais. value/onChange em CENTAVOS (number | null). */
export function PriceInput({ value, onChange, label, error, hint, required, id, placeholder = "0,00", disabled }: FieldProps & {
  value: number | null; onChange: (cents: number | null) => void; id?: string; placeholder?: string; disabled?: boolean;
}) {
  const auto = useId(); const fid = id ?? auto;
  const display = value == null ? "" : (value / 100).toFixed(2).replace(".", ",");
  return (
    <FieldWrap id={fid} label={label} hint={hint} error={error} required={required}>
      <div className={cx(inputCls(error), "flex items-center gap-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25")}>
        <span className="text-ink-muted" aria-hidden="true">R$</span>
        <input id={fid} inputMode="numeric" disabled={disabled} placeholder={placeholder} aria-invalid={!!error || undefined} aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined} className="ev-num h-full w-full bg-transparent outline-none" value={display}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
            onChange(digits === "" ? null : Number(digits));
          }} />
      </div>
    </FieldWrap>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-line bg-surface p-4 shadow-card", className)} {...rest}>{children}</div>;
}

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "accent";
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-ink/5 text-ink", brand: "bg-brand-soft text-brand-strong", success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-ink", danger: "bg-danger/10 text-danger", accent: "bg-accent/10 text-accent",
    // todos os pares acima têm contraste ≥ 4,5:1 (ver docs/03-design.md)
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      {icon}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Algo deu errado", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <p className="font-semibold text-danger">{title}</p>
      <p className="text-sm text-ink">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

/** Diálogo modal (no celular vira folha inferior). */
export function Dialog({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-3xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cx("max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-surface p-5 shadow-xl outline-none sm:rounded-2xl", w)}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-ink/5 hover:text-ink">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: string; badge?: ReactNode }>; className?: string }) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto rounded-xl bg-ink/5 p-1", className)}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} tabIndex={value === t.value ? 0 : -1} onClick={() => onChange(t.value)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = tabs.findIndex((x) => x.value === value);
            const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
            onChange(next.value);
            const list = e.currentTarget.parentElement;
            requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
          }}
          className={cx("flex min-h-[40px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors", value === t.value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}>
          {t.label}{t.badge}
        </button>
      ))}
    </div>
  );
}

// ---------- Toasts ----------
type ToastMsg = { id: number; tone: "success" | "error" | "info"; text: string };
let toastListeners: Array<(t: ToastMsg[]) => void> = [];
let toasts: ToastMsg[] = [];
let toastSeq = 0;
export function toast(text: string, tone: ToastMsg["tone"] = "info") {
  const t = { id: ++toastSeq, tone, text };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); toastListeners.forEach((l) => l(toasts)); }, 4500);
}
export function Toaster() {
  const [list, setList] = useStateCompat<ToastMsg[]>([]);
  useEffect(() => { toastListeners.push(setList); return () => { toastListeners = toastListeners.filter((l) => l !== setList); }; }, [setList]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 sm:bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cx("pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg", t.tone === "success" ? "bg-success" : t.tone === "error" ? "bg-danger" : "bg-ink")}>{t.text}</div>
      ))}
    </div>
  );
}
import { useState as useStateCompat } from "react";
