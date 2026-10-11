"use client";
import { EmptyState, ErrorState, Card, Button, toast } from "@/components/ui";
import { confirmAction, LoadingBlock, PageHeader, Thumb } from "@/components/app/common";
import { api, asList, assetUrl, type DuplicateGroup } from "@/lib/client/api";
import { money } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

const REASON: Record<string, string> = { codigo_de_barras: "Mesmo código de barras", nome_parecido: "Nomes parecidos" };

export default function DuplicatesPage() {
  const { can } = useMe();
  const q = useApi<unknown>("/api/products/duplicates");
  const groups = asList<DuplicateGroup>(q.data, "groups");
  const archive = async (id: string, name: string) => {
    if (!confirmAction(`Arquivar "${name}"?`)) return;
    try { await api.del(`/api/products/${id}`); toast("Produto arquivado.", "success"); void q.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <PageHeader title="Prováveis duplicados" back={{ href: "/app/produtos", label: "Produtos" }} description="Produtos com nome ou código de barras muito parecidos. Arquive o que estiver sobrando." />
      {q.loading ? <LoadingBlock /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : groups.length === 0 ? (
        <EmptyState title="Nenhum duplicado encontrado" description="Seu catálogo está organizado." />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g, gi) => (
            <Card key={g.key ?? gi}>
              {g.reason && <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">{REASON[g.reason] ?? g.reason}</p>}
              <ul className="flex flex-col gap-2">
                {g.products.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Thumb url={p.imageUrl ?? assetUrl(p.imageAssetId)} alt={p.name} size={44} />
                    <div className="min-w-0 flex-1"><p className="font-semibold">{p.name}</p><p className="text-xs text-ink-muted">{[p.brand, p.sizeLabel, p.barcode].filter(Boolean).join(" · ")} · {money(p.promoCents ?? p.regularCents)}</p></div>
                    {can("products.write") && <Button size="sm" variant="ghost" onClick={() => archive(p.id, p.name)}>Arquivar</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
