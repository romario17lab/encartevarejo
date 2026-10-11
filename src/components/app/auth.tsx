"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <Card className="p-5 sm:p-6">
        <h1 className="font-display text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        {children && <div className="mt-5">{children}</div>}
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
    </>
  );
}

/** Força da senha: só uma dica, a regra obrigatória é mínimo de 8 caracteres. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 8) return { score: 0, label: pw ? "Muito curta: use pelo menos 8 caracteres" : "Use pelo menos 8 caracteres" };
  let s = 0;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Fraca: misture letras, números e símbolos" };
  if (s === 2) return { score: 2, label: "Boa" };
  return { score: 3, label: "Forte" };
}

export function StrengthBar({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const colors = ["bg-line", "bg-danger", "bg-warning", "bg-success"];
  return (
    <div className="mt-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${score >= i ? colors[score] : "bg-line"}`} />)}
      </div>
      <p className="mt-1 text-xs text-ink-muted">Força da senha: {label}</p>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{message}</p>;
}

export function useSubmit<T>(fn: () => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true); setError(null);
    try { return await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível concluir."); }
    finally { setLoading(false); }
  };
  return { loading, error, setError, onSubmit };
}

/** Só aceita caminhos internos para o redirecionamento pós-login. */
export function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/app";
}
