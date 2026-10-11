"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { useApi, useMe } from "@/lib/client/hooks";
import { BranchForm } from "./BranchForm";
import { addressText, fmtWhats, type BranchStore, type StoresOverview } from "./types";

/** Uso do plano em texto: "2 de 3 lojas do plano Profissional". */
export function planUsageText(p: StoresOverview["plan"]) {
  return `${p.storesUsed} de ${p.storeLimit} loja${p.storeLimit === 1 ? "" : "s"} do plano ${p.name}`;
}

export function BranchesPage() {
  const { can, reload: reloadMe } = useMe();
  const manage = can("stores.manage");
  const q = useApi<StoresOverview>("/api/stores/overview");
  const [editing, setEditing] = useState<BranchStore | "new" | null>(null);
  const ov = q.data;
  const atLimit = !!ov && ov.plan.storesUsed >= ov.plan.storeLimit;
  const limitMsg = ov && atLimit
    ? `O plano ${ov.plan.name} permite até ${ov.plan.storeLimit} loja${ov.plan.storeLimit === 1 ? "" : "s"}. Para cadastrar outra filial, altere o plano da conta.`
    : null;

  return (
    <>
      <PageHeader title="Filiais" description="Cada filial tem endereço, contatos, horários, vitrine e preços próprios. A identidade visual pode ser compartilhada."
        actions={manage && ov ? <Button onClick={() => setEditing("new")} disabled={atLimit}>Nova filial</Button> : undefined} />
      {q.loading && !ov ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : ov && (
        <>
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{planUsageText(ov.plan)}</p>
              <div className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (ov.plan.storesUsed / Math.max(1, ov.plan.storeLimit)) * 100)}%` }} />
              </div>
            </div>
            {limitMsg ? <p role="status" className="text-sm text-ink-muted sm:max-w-sm">{limitMsg} <Link href="/app/conta" className="font-semibold text-brand underline">Ver plano</Link></p>
              : !ov.plan.branchesFeature ? <p className="text-sm text-ink-muted sm:max-w-sm">O plano {ov.plan.name} não inclui duplicar campanhas entre filiais.</p> : null}
          </div>
          {ov.restricted && <p className="mb-3 text-sm text-ink-muted">Você vê apenas as lojas às quais tem acesso.</p>}
          {ov.stores.length === 0 ? <EmptyState title="Nenhuma loja disponível" description="Peça ao administrador para liberar o acesso às filiais." /> : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {ov.stores.map((s) => (
                <li key={s.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-lg font-bold">{s.name}</h2>
                        <p className="text-sm text-ink-muted">{addressText(s.address) || "Endereço não cadastrado"}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap">{s.storefrontEnabled === false ? <Badge>Vitrine desligada</Badge> : <Badge tone="success">Vitrine ativa</Badge>}</span>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-ink-muted">Vitrine</dt>
                      <dd className="min-w-0 truncate"><a href={`/loja/${s.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">/loja/{s.slug}</a></dd>
                      <dt className="text-ink-muted">Identidade</dt>
                      <dd className="min-w-0 truncate">{s.brandKitName ?? "—"}</dd>
                      <dt className="text-ink-muted">Contatos</dt>
                      <dd className="min-w-0 truncate">{[s.phone, s.whatsapp && `WhatsApp ${fmtWhats(s.whatsapp)}`].filter(Boolean).join(" · ") || "—"}</dd>
                      <dt className="text-ink-muted">Preços</dt>
                      <dd>{s.priceOverrides ? `${s.priceOverrides} preço${s.priceOverrides > 1 ? "s" : ""} próprio${s.priceOverrides > 1 ? "s" : ""}; o restante usa o catálogo` : "Usa os preços do catálogo"}</dd>
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Link href={`/app/filiais/${s.id}/precos`} className="inline-flex h-9 items-center rounded-xl border border-line-strong/60 bg-surface px-3 text-sm font-semibold hover:bg-surface-alt">Preços da filial</Link>
                      {manage && <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>Editar dados</Button>}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {editing && (
            <BranchForm open onClose={() => setEditing(null)} store={editing === "new" ? null : editing} kits={ov.brandKits} limitText={editing === "new" ? `Você está usando ${planUsageText(ov.plan)}.` : null}
              onSaved={() => { setEditing(null); void q.reload(); void reloadMe(); }} />
          )}
        </>
      )}
    </>
  );
}
