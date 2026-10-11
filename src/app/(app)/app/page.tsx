"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState, ErrorState } from "@/components/ui";
import { CampaignRow, ReuseCampaignDialog } from "@/components/app/campaigns";
import { LoadingBlock, SectionTitle } from "@/components/app/common";
import { IconCopy, IconImage, IconPlus, IconTag, IconAlert } from "@/components/app/icons";
import { asList, qs, type CampaignSummary, type Product } from "@/lib/client/api";
import { useApi, useMe } from "@/lib/client/hooks";

type ProductPage = { items?: Product[]; nextCursor?: string | null; total?: number };

function countLabel(q: { data?: unknown }) {
  const d = q.data as ProductPage | Product[] | undefined;
  if (!d) return null;
  if (!Array.isArray(d) && typeof d.total === "number") return String(d.total);
  const n = asList<Product>(d, "products").length;
  return !Array.isArray(d) && d.nextCursor ? `${n}+` : String(n);
}

export default function Dashboard() {
  const { me, can, storeId } = useMe();
  const [reuse, setReuse] = useState(false);
  const campaigns = useApi<unknown>(`/api/campaigns${qs({ storeId })}`, [storeId]);
  const noImage = useApi<unknown>(can("products.read") ? "/api/products?issues=sem_imagem" : null);
  const incomplete = useApi<unknown>(can("products.read") ? "/api/products?issues=incompleto" : null);
  const recent = asList<CampaignSummary>(campaigns.data, "campaigns").sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 5);
  const first = me.user.name.split(" ")[0];
  const actions = [
    can("campaigns.write") && { href: "/app/campanhas/nova", label: "Criar campanha", desc: "Escolha o modelo, adicione produtos e gere as peças.", icon: IconPlus, primary: true },
    can("campaigns.write") && { onClick: () => setReuse(true), label: "Reutilizar campanha", desc: "Copie uma campanha anterior e só troque os preços.", icon: IconCopy },
    can("products.write") && { href: "/app/produtos/precos", label: "Atualizar preços", desc: "Altere vários preços de uma vez e confira as diferenças.", icon: IconTag },
  ].filter(Boolean) as Array<{ href?: string; onClick?: () => void; label: string; desc: string; icon: typeof IconPlus; primary?: boolean }>;

  return (
    <>
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Olá, {first}</h1>
      <p className="text-sm text-ink-muted">{me.org.name}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {actions.map((a) => {
          const inner = (
            <>
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.primary ? "bg-white/20" : "bg-brand-soft text-brand"}`}><a.icon /></span>
              <span><span className="block text-lg font-bold">{a.label}</span><span className={`block text-sm ${a.primary ? "text-white/90" : "text-ink-muted"}`}>{a.desc}</span></span>
            </>
          );
          const cls = `flex items-center gap-4 rounded-2xl p-4 text-left shadow-sm transition sm:flex-col sm:items-start ${a.primary ? "bg-brand text-white hover:bg-brand-strong" : "border border-line bg-surface hover:border-brand"}`;
          return a.href ? <Link key={a.label} href={a.href} className={cls}>{inner}</Link> : <button key={a.label} onClick={a.onClick} className={cls}>{inner}</button>;
        })}
      </div>

      <SectionTitle aside={<Link href="/app/campanhas" className="text-sm font-semibold text-brand underline">Ver todas</Link>}>Campanhas recentes</SectionTitle>
      {campaigns.loading ? <LoadingBlock /> : campaigns.error ? <ErrorState message={campaigns.error.message} onRetry={campaigns.reload} /> : recent.length === 0 ? (
        <EmptyState title="Você ainda não criou campanhas" description="Comece cadastrando alguns produtos ou crie a campanha direto: dá para adicionar produtos no caminho."
          action={can("campaigns.write") ? <Link href="/app/campanhas/nova" className="inline-flex h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white">Criar campanha</Link> : undefined} />
      ) : (
        <div className="flex flex-col gap-2">{recent.map((c) => <CampaignRow key={c.id} c={c} />)}</div>
      )}

      {can("products.read") && (
        <>
          <SectionTitle>Saúde do catálogo</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthCard q={noImage} href="/app/produtos?issues=sem_imagem" icon={<IconImage />} title="Produtos sem foto" ok="Todos os produtos têm foto." />
            <HealthCard q={incomplete} href="/app/produtos?issues=incompleto" icon={<IconAlert />} title="Produtos incompletos" ok="Nenhum produto com dados faltando." hint="Sem unidade, preço ou foto." />
          </div>
        </>
      )}
      <ReuseCampaignDialog open={reuse} onClose={() => setReuse(false)} />
    </>
  );
}

function HealthCard({ q, href, icon, title, ok, hint }: { q: ReturnType<typeof useApi<unknown>>; href: string; icon: React.ReactNode; title: string; ok: string; hint?: string }) {
  const n = countLabel(q);
  return (
    <Card className="flex items-center gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {q.loading ? <p className="text-sm text-ink-muted">Verificando…</p> : q.error ? <p className="text-sm text-danger">{q.error.message}</p> : n === "0" ? (
          <p className="text-sm text-success">{ok}</p>
        ) : (
          <p className="text-sm"><Link href={href} className="font-semibold text-brand underline">{n} {n === "1" ? "produto" : "produtos"} para revisar</Link>{hint && <span className="text-ink-muted"> · {hint}</span>}</p>
        )}
      </div>
    </Card>
  );
}
