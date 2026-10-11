"use client";
import Link from "next/link";
import { Card } from "@/components/ui";
import { useApi } from "@/lib/client/hooks";
import { AdminPageHeader, fmtInt, fmtMb, QueryView, StatCard, SUB_STATUS } from "./shared";

interface Overview {
  orgs: number; suspended: number; exportsLast7Days: number; failedExportsLast7Days: number; billingFailuresLast7Days: number;
  subscriptions: Record<string, number>; storageBytes: number;
}

export function AdminOverview() {
  const q = useApi<Overview>("/api/admin/overview");
  return (
    <div>
      <AdminPageHeader title="Visão geral" description="Situação da plataforma. Toda ação feita nesta área fica no registro de ações." />
      <QueryView q={q}>
        {(d) => (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Contas" value={fmtInt(d.orgs)} hint={d.suspended ? `${d.suspended} suspensa(s)` : "nenhuma suspensa"} tone={d.suspended ? "warning" : undefined} href="/admin/contas" />
              <StatCard label="Falhas de exportação (7 dias)" value={fmtInt(d.failedExportsLast7Days)} hint={`de ${fmtInt(d.exportsLast7Days)} exportações`} tone={d.failedExportsLast7Days ? "danger" : undefined} href="/admin/exportacoes" />
              <StatCard label="Falhas de cobrança (7 dias)" value={fmtInt(d.billingFailuresLast7Days)} tone={d.billingFailuresLast7Days ? "danger" : undefined} href="/admin/cobranca" />
              <StatCard label="Armazenamento total" value={fmtMb(d.storageBytes)} href="/admin/consumo" />
            </div>
            <Card>
              <h2 className="mb-3 font-display text-base font-bold">Assinaturas</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries(SUB_STATUS).map(([k, s]) => (
                  <li key={k} className="rounded-xl bg-surface-alt p-3">
                    <p className="text-xs font-semibold text-ink-muted">{s.label}</p>
                    <p className="font-display text-xl font-extrabold ev-num">{fmtInt(d.subscriptions[k] ?? 0)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-muted">Contas sem linha de assinatura aparecem como “Sem assinatura” na lista de contas.</p>
            </Card>
            <Card>
              <h2 className="mb-2 font-display text-base font-bold">Atalhos</h2>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li><Link className="font-semibold text-brand-strong underline-offset-2 hover:underline" href="/admin/modelos">Publicar ou despublicar versões de modelos</Link></li>
                <li><Link className="font-semibold text-brand-strong underline-offset-2 hover:underline" href="/admin/planos">Editar planos e limites</Link></li>
                <li><Link className="font-semibold text-brand-strong underline-offset-2 hover:underline" href="/admin/contas?suspended=1">Contas suspensas</Link></li>
                <li><Link className="font-semibold text-brand-strong underline-offset-2 hover:underline" href="/admin/registro">Registro de ações da administração</Link></li>
              </ul>
            </Card>
          </div>
        )}
      </QueryView>
    </div>
  );
}
