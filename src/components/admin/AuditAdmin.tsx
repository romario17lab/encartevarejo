"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { qs } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtDateTime } from "@/lib/client/format";
import { AdminPageHeader, DetailsText, FilterBar, QueryView, TableWrap, td, th } from "./shared";

interface Entry { id: number; action: string; actionLabel: string; targetType: string; targetId: string | null; details: Record<string, unknown>; createdAt: string; adminName: string | null; adminEmail: string | null }
interface Data { items: Entry[]; nextBefore: number | null; actions: Array<{ value: string; label: string }> }

const TARGET: Record<string, string> = { organization: "Conta", plan: "Plano", template: "Modelo", template_version: "Versão de modelo", export_job: "Exportação", user: "Usuário" };

export function AuditAdmin() {
  const [action, setAction] = useState("");
  const [before, setBefore] = useState<number | null>(null);
  const q = useApi<Data>(`/api/admin/audit${qs({ action, before })}`);
  const link = (e: Entry) => {
    if (!e.targetId) return "—";
    if (e.targetType === "organization") return <Link className="font-semibold text-brand-strong hover:underline" href={`/admin/contas/${e.targetId}`}>{String(e.details?.orgName ?? e.targetId)}</Link>;
    if (e.targetType === "template" || e.targetType === "template_version") return <Link className="font-semibold text-brand-strong hover:underline" href="/admin/modelos">{e.targetId}</Link>;
    if (e.targetType === "plan") return <Link className="font-semibold text-brand-strong hover:underline" href="/admin/planos">{e.targetId}</Link>;
    return <code className="text-xs">{e.targetId}</code>;
  };
  return (
    <div>
      <AdminPageHeader title="Registro de ações" description="Toda ação da administração da plataforma, com quem fez, quando e o quê. Não é possível editar nem apagar registros por aqui." />
      <FilterBar>
        <Select label="Ação" value={action} onChange={(e) => { setBefore(null); setAction(e.target.value); }} options={[{ value: "", label: "Todas" }, ...(q.data?.actions ?? [])]} />
      </FilterBar>
      <QueryView q={q} empty={{ title: "Nenhuma ação registrada", description: "As ações feitas nesta área aparecem aqui." }} isEmpty={(d) => !d.items.length} loadingLabel="Carregando registro…">
        {(d) => (
          <>
            <TableWrap label="Registro de ações da administração">
              <thead><tr>{["Data", "Administrador", "Ação", "Alvo", "Detalhes"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.items.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDateTime(e.createdAt)}</td>
                    <td className={td}>{e.adminName ?? "—"}<span className="block break-all text-xs text-ink-muted">{e.adminEmail}</span></td>
                    <td className={td}>{e.actionLabel}</td>
                    <td className={td}><span className="block text-xs text-ink-muted">{TARGET[e.targetType] ?? e.targetType}</span>{link(e)}</td>
                    <td className={`${td} min-w-[240px]`}><DetailsText data={e.details} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <div className="mt-3 flex gap-2">
              {before && <Button size="sm" variant="secondary" onClick={() => setBefore(null)}>Mais recentes</Button>}
              {d.nextBefore && <Button size="sm" variant="secondary" onClick={() => setBefore(d.nextBefore)}>Mais antigos</Button>}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
