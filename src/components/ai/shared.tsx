"use client";
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";

// Tipos e peças comuns da IA assistida na interface.

export interface AiStatus {
  configured: { llm: boolean; backgroundRemoval: boolean };
  model: string | null;
  credits: { used: number; limit: number; planName: string; perRequest: Record<string, number> };
}

export function useAiStatus() {
  return useApi<AiStatus>("/api/ai/status");
}

export function creditsLeft(s: AiStatus | undefined) {
  return s ? Math.max(0, s.credits.limit - s.credits.used) : 0;
}

/** Selo "IA" para identificar sugestões automáticas. */
export function AiBadge({ children = "IA" }: { children?: ReactNode }) {
  return <Badge tone="accent"><span aria-hidden="true">✦</span>{children}</Badge>;
}

/** Aviso padrão de revisão humana obrigatória. */
export function ReviewNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
      <strong>Revise antes de salvar.</strong>{" "}
      {children ?? "A IA pode errar. Nada é salvo sem a sua confirmação, e preços, unidades e marcas só valem se estiverem na sua fonte."}
    </p>
  );
}

/** Mensagem quando a integração não está configurada (o caminho manual continua disponível). */
export function NotConfigured({ what, manual }: { what: string; manual?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-ink/5 px-3 py-2 text-sm" role="note">
      <p><strong>{what}: não configurado.</strong> Esta integração ainda não foi ativada pelo administrador da plataforma.</p>
      {manual && <p className="mt-1 text-ink-muted">{manual}</p>}
    </div>
  );
}

/** Créditos de IA do mês (usado / limite). */
export function CreditsMeter({ status, className }: { status: AiStatus; className?: string }) {
  const { used, limit } = status.credits;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className={cx("text-sm", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span>Créditos de IA neste mês</span>
        <span className="font-semibold tabular-nums">{limit > 0 ? `${used} de ${limit}` : "não incluídos no plano"}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label="Créditos de IA usados">
        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-brand")} style={{ width: `${limit > 0 ? pct : 0}%` }} />
      </div>
    </div>
  );
}

export const CONFIDENCE_LABEL: Record<string, string> = { alta: "confiança alta", media: "confiança média", baixa: "confiança baixa" };
