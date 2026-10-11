"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, ErrorState, Tabs } from "@/components/ui";
import { CampaignRow, ReuseCampaignDialog } from "@/components/app/campaigns";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { IconCopy, IconPlus } from "@/components/app/icons";
import { CAMPAIGN_STATUSES, STATUS_LABEL, type CampaignStatus } from "@/domain/campaign";
import { asList, qs, type CampaignSummary } from "@/lib/client/api";
import { useApi, useMe } from "@/lib/client/hooks";

export default function CampaignsPage() {
  const { can, storeId } = useMe();
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const [reuse, setReuse] = useState(false);
  const q = useApi<unknown>(`/api/campaigns${qs({ status, storeId })}`, [status, storeId]);
  const list = asList<CampaignSummary>(q.data, "campaigns").sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return (
    <>
      <PageHeader title="Campanhas" description="Cada campanha gera encarte, posts, story, cartazes, etiquetas, banner e TV com os mesmos preços."
        actions={can("campaigns.write") && <>
          <Link href="/app/campanhas/nova" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong"><IconPlus size={18} />Criar campanha</Link>
          <Button variant="secondary" icon={<IconCopy size={18} />} onClick={() => setReuse(true)}>Reutilizar</Button>
        </>} />
      <Tabs value={status} onChange={setStatus} className="mb-4"
        tabs={[{ value: "" as CampaignStatus | "", label: "Todas" }, ...CAMPAIGN_STATUSES.map((s) => ({ value: s as CampaignStatus | "", label: STATUS_LABEL[s] }))]} />
      {q.loading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : list.length === 0 ? (
        <EmptyState title={status ? `Nenhuma campanha ${STATUS_LABEL[status].toLowerCase()}` : "Nenhuma campanha ainda"}
          description={status ? "Escolha outro filtro para ver as demais." : "Crie a primeira: escolha um modelo, adicione os produtos e pronto."}
          action={!status && can("campaigns.write") ? <Link href="/app/campanhas/nova" className="inline-flex h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white">Criar campanha</Link> : undefined} />
      ) : <div className="flex flex-col gap-2">{list.map((c) => <CampaignRow key={c.id} c={c} />)}</div>}
      <ReuseCampaignDialog open={reuse} onClose={() => setReuse(false)} />
    </>
  );
}
