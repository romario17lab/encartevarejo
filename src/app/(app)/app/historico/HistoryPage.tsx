"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Select } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { api, asList, qs, type StoreSummary } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

interface Entry {
  id: number; action: string; entityType: string; entityId: string | null; summary: string; createdAt: string;
  userId: string | null; userName: string | null; storeId: string | null; storeName: string | null;
}

/** Nome da ação em português (o resumo detalhado vem do servidor). */
const ACTION_LABEL: Record<string, string> = {
  "campaign.create": "Campanha criada", "campaign.update": "Campanha editada", "campaign.duplicate": "Campanha duplicada",
  "campaign.delete": "Campanha excluída", "campaign.restore": "Versão restaurada", "campaign.template": "Modelo trocado",
  "campaign.submit": "Enviada para revisão", "campaign.approve": "Campanha aprovada", "campaign.reject": "Campanha reprovada",
  "campaign.publish": "Campanha publicada", "campaign.schedule": "Publicação agendada", "campaign.schedule_cancelled": "Agendamento cancelado",
  "campaign.unpublish": "Retirada da vitrine", "campaign.end": "Campanha encerrada",
  "product.create": "Produto cadastrado", "product.update": "Produto alterado", "product.archive": "Produto arquivado",
  "product.import": "Planilha importada", "product.bulk_price": "Preços atualizados em lote",
  "store_price.update": "Preços da filial alterados", "store_price.delete": "Preço da filial removido",
  "store.create": "Loja cadastrada", "store.update": "Dados da loja alterados", "store.delete": "Loja excluída",
  "brand.create": "Identidade visual criada", "brand.update": "Identidade visual alterada",
  "member.invite": "Convite enviado", "member.invite_resend": "Convite reenviado", "member.invite_revoke": "Convite cancelado",
  "member.join": "Entrou na equipe", "member.update": "Permissões alteradas", "member.remove": "Removido da equipe",
  "export.create": "Arquivos exportados", "asset.upload": "Imagem enviada",
  "calendar.create": "Data comercial criada", "calendar.update": "Data comercial alterada", "calendar.delete": "Data comercial excluída",
  "org.create": "Conta criada", "org.update": "Dados da conta alterados", "org.export": "Dados da conta exportados", "org.delete": "Conta excluída",
  "auth.login": "Acesso", "auth.password_reset": "Senha redefinida",
};
const PREFIX_LABEL: Record<string, string> = {
  campaign: "Campanha", product: "Produto", store_price: "Preço da filial", store: "Loja", brand: "Identidade visual", member: "Equipe",
  export: "Exportação", org: "Conta", billing: "Cobrança", subscription: "Assinatura", plan: "Plano", auth: "Acesso", calendar: "Calendário", asset: "Imagem",
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? PREFIX_LABEL[a.split(".")[0]!] ?? "Alteração";

const TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" }, { value: "campanhas", label: "Campanhas" }, { value: "produtos", label: "Produtos e preços" },
  { value: "lojas", label: "Lojas e identidade visual" }, { value: "equipe", label: "Equipe e convites" },
  { value: "exportacoes", label: "Exportações" }, { value: "conta", label: "Conta e plano" }, { value: "acessos", label: "Acessos" },
];
const TONE: Record<string, "brand" | "success" | "warning" | "danger" | "accent" | "neutral"> = {
  campaign: "brand", product: "accent", store_price: "accent", store: "success", brand: "success", member: "warning", org: "neutral",
};

function campaignHref(e: Entry) { return e.entityType === "campaign" && e.entityId && e.action !== "campaign.delete" ? `/app/campanhas/${e.entityId}` : null; }

export function HistoryPage() {
  const { can } = useMe();
  const allowed = can("audit.read");
  const stores = useApi<unknown>(allowed ? "/api/stores" : null);
  const storeList = asList<StoreSummary>(stores.data, "stores");
  const [type, setType] = useState("");
  const [store, setStore] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nonce, setNonce] = useState(0);

  const fetchPage = useCallback(async (after: string | null) => {
    const r = await api.get<{ entries: Entry[]; nextCursor: string | null }>(`/api/audit${qs({ tipo: type, loja: store, cursor: after, limit: 30 })}`);
    return r;
  }, [type, store]);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    setEntries(null); setError(null);
    fetchPage(null).then((r) => { if (live) { setEntries(r.entries); setCursor(r.nextCursor); } }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [allowed, fetchPage, nonce]);

  const more = async () => {
    setLoadingMore(true);
    try { const r = await fetchPage(cursor); setEntries((cur) => [...(cur ?? []), ...r.entries]); setCursor(r.nextCursor); }
    catch (e) { setError((e as Error).message); }
    finally { setLoadingMore(false); }
  };

  if (!allowed) {
    return (
      <>
        <PageHeader title="Histórico" />
        <EmptyState title="Sem acesso ao histórico" description="Somente administradores e aprovadores veem o histórico de alterações da conta." />
      </>
    );
  }

  // agrupa por dia
  const groups: Array<{ day: string; items: Entry[] }> = [];
  for (const e of entries ?? []) {
    const day = new Date(e.createdAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e); else groups.push({ day, items: [e] });
  }

  return (
    <>
      <PageHeader title="Histórico" description="Quem fez o quê e quando: campanhas, preços, lojas e equipe." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)} options={TYPE_OPTIONS} />
        <Select label="Loja" value={store} onChange={(e) => setStore(e.target.value)}
          options={[{ value: "", label: storeList.length > 1 ? "Todas as lojas" : "Todas" }, ...storeList.map((s) => ({ value: s.id, label: s.name }))]} />
      </div>
      {error ? <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} />
        : !entries ? <LoadingBlock /> : entries.length === 0 ? (
          <EmptyState title="Nada registrado" description={type || store ? "Nenhuma alteração com esses filtros." : "As alterações da conta aparecem aqui."} />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.day}>
                <h2 className="mb-2 text-sm font-semibold text-ink-muted">{g.day.charAt(0).toUpperCase() + g.day.slice(1)}</h2>
                <ol className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {g.items.map((e) => {
                    const href = campaignHref(e);
                    return (
                      <li key={e.id} className="flex flex-col gap-1 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={TONE[e.action.split(".")[0]!] ?? "neutral"}>{actionLabel(e.action)}</Badge>
                          {e.storeName && <span className="text-xs text-ink-muted">{e.storeName}</span>}
                          <time dateTime={e.createdAt} className="ml-auto text-xs text-ink-muted">{fmtDateTime(e.createdAt).split(" às ")[1]}</time>
                        </div>
                        <p className="text-sm">{e.summary}</p>
                        <p className="text-xs text-ink-muted">
                          por <span className="font-semibold text-ink">{e.userName ?? "Sistema (automático)"}</span>
                          {href && <> · <Link href={href} className="font-semibold text-brand underline">abrir campanha</Link></>}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {cursor && <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={more}>Carregar mais</Button></div>}
          </div>
        )}
    </>
  );
}
