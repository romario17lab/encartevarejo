"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Dialog, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { confirmAction, LoadingBlock, PageHeader, Thumb } from "@/components/app/common";
import { IconPlus, IconSearch, IconUpload } from "@/components/app/icons";
import { ProductForm } from "@/components/app/ProductForm";
import { api, ApiError, asList, assetUrl, qs, type Product } from "@/lib/client/api";
import { money, unitShort } from "@/lib/client/format";
import { useDebounced, useMe } from "@/lib/client/hooks";

type Page = { items?: Product[]; products?: Product[]; nextCursor?: string | null };

export function productIssues(p: Product): string[] {
  if (p.issues?.length) return p.issues;
  const out: string[] = [];
  if (!p.imageAssetId) out.push("Sem foto");
  if (!p.unit) out.push("Sem unidade");
  if (p.regularCents == null && p.promoCents == null) out.push("Sem preço");
  if (!p.category) out.push("Sem categoria");
  return out;
}
const ISSUE_LABEL: Record<string, string> = { sem_imagem: "Sem foto", sem_foto: "Sem foto", incompleto: "Incompleto", sem_unidade: "Sem unidade", sem_preco: "Sem preço", sem_categoria: "Sem categoria" };

export function ProductsList({ initial }: { initial: { q: string; category: string; issues: string; novo: boolean } }) {
  const router = useRouter();
  const { me, can } = useMe();
  const [q, setQ] = useState(initial.q);
  const [category, setCategory] = useState(initial.category);
  const [issues, setIssues] = useState(initial.issues);
  const dq = useDebounced(q, 300);
  const [items, setItems] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<Product | null | "new">(initial.novo ? "new" : null);
  const [knownCats, setKnownCats] = useState<string[]>([]);

  const load = useCallback(async (more = false, cur: string | null = null) => {
    more ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const res = await api.get<Page | Product[]>(`/api/products${qs({ q: dq, category, issues, cursor: more ? cur : null })}`);
      const list = asList<Product>(res, "products");
      setItems((prev) => (more ? [...prev, ...list] : list));
      setCursor(Array.isArray(res) ? null : res.nextCursor ?? null);
      setKnownCats((prev) => [...new Set([...prev, ...list.map((p) => p.category).filter(Boolean) as string[]])].sort((a, b) => a.localeCompare(b, "pt-BR")));
    } catch (e) { setError(e as ApiError); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [dq, category, issues]);
  useEffect(() => { void load(); }, [load]);

  // mantém filtros na URL (link compartilhável / voltar)
  useEffect(() => {
    router.replace(`/app/produtos${qs({ q: dq, categoria: category, issues })}`, { scroll: false });
  }, [dq, category, issues, router]);

  const archive = async (p: Product) => {
    if (!confirmAction(`Arquivar "${p.name}"? Ele deixa de aparecer na lista, mas campanhas existentes não mudam.`)) return;
    try {
      await api.del(`/api/products/${p.id}`);
      setItems((prev) => prev.filter((x) => x.id !== p.id));
      toast("Produto arquivado.", "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const onSaved = (p: Product) => {
    setItems((prev) => { const i = prev.findIndex((x) => x.id === p.id); if (i < 0) return [p, ...prev]; const n = [...prev]; n[i] = p; return n; });
    setEditing(null);
  };
  const catOptions = useMemo(() => [{ value: "", label: "Todas as categorias" }, ...knownCats.map((c) => ({ value: c, label: c })), ...(category && !knownCats.includes(category) ? [{ value: category, label: category }] : [])], [knownCats, category]);
  const writable = can("products.write");
  const filtered = !!(dq || category || issues);

  return (
    <>
      <PageHeader title="Produtos" description="Seu catálogo. Os preços daqui viram sugestão ao criar campanhas."
        actions={writable && <>
          <Button icon={<IconPlus size={18} />} onClick={() => setEditing("new")}>Novo produto</Button>
          <Link href="/app/produtos/colar" className="inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold">Colar lista</Link>
          <Link href="/app/produtos/importar" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[15px] font-semibold"><IconUpload size={18} />Importar</Link>
        </>} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {writable && <Link href="/app/produtos/precos" className="font-semibold text-brand underline">Atualizar preços em massa</Link>}
        <span aria-hidden className="text-line">|</span>
        <Link href="/app/produtos/duplicados" className="font-semibold text-brand underline">Ver duplicados</Link>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_220px_200px]">
        <div className="relative col-span-2 sm:col-span-1">
          <span className="pointer-events-none absolute left-3 top-[34px] text-ink-muted sm:top-[34px]"><IconSearch size={18} /></span>
          <Input label="Buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca ou código" className="pl-10" />
        </div>
        <Select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} options={catOptions} />
        <Select label="Situação" value={issues} onChange={(e) => setIssues(e.target.value)} options={[{ value: "", label: "Todos" }, { value: "sem_imagem", label: "Sem foto" }, { value: "incompleto", label: "Incompletos" }]} />
      </div>

      {loading ? <LoadingBlock label="Carregando produtos…" /> : error ? <ErrorState message={error.message} onRetry={() => load()} /> : items.length === 0 ? (
        filtered ? <EmptyState title="Nenhum produto encontrado" description="Tente outra busca ou limpe os filtros." action={<Button variant="secondary" onClick={() => { setQ(""); setCategory(""); setIssues(""); }}>Limpar filtros</Button>} />
          : <EmptyState title="Nenhum produto cadastrado" description="Cadastre um por um, cole uma lista do WhatsApp ou importe a planilha do seu sistema."
            action={writable ? <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setEditing("new")}>Cadastrar produto</Button><Link href="/app/produtos/colar" className="inline-flex h-11 items-center rounded-xl border border-line px-4 font-semibold">Colar lista</Link></div> : undefined} />
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-muted" aria-live="polite">{items.length}{cursor ? "+" : ""} {items.length === 1 ? "produto" : "produtos"}</p>
          {/* celular: cartões */}
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
                <Thumb url={p.imageUrl ?? assetUrl(p.imageAssetId)} alt={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{p.name}</p>
                  {[p.brand, p.sizeLabel, p.category].some(Boolean) && <p className="text-xs text-ink-muted">{[p.brand, p.sizeLabel, p.category].filter(Boolean).join(" · ")}</p>}
                  <p className="mt-1 text-sm"><Price p={p} /></p>
                  <IssueBadges p={p} />
                  {writable && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => archive(p)}>Arquivar</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* computador: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="p-3">Produto</th><th className="p-3">Categoria</th><th className="p-3">Unid.</th><th className="p-3 text-right">Normal</th><th className="p-3 text-right">Promo</th><th className="p-3">Pendências</th><th className="p-3"><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="p-3"><div className="flex items-center gap-3"><Thumb url={p.imageUrl ?? assetUrl(p.imageAssetId)} alt={p.name} size={44} /><div><p className="font-semibold">{p.name}</p><p className="text-xs text-ink-muted">{[p.brand, p.sizeLabel].filter(Boolean).join(" · ")}</p></div></div></td>
                    <td className="p-3">{p.category ?? "—"}</td>
                    <td className="p-3">{unitShort(p.unit) || "—"}</td>
                    <td className="p-3 text-right tabular-nums">{money(p.regularCents)}</td>
                    <td className="p-3 text-right tabular-nums">{money(p.promoCents)}</td>
                    <td className="p-3"><IssueBadges p={p} /></td>
                    <td className="p-3 text-right">{writable && <div className="flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => archive(p)}>Arquivar</Button></div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && <div className="mt-4 flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={() => load(true, cursor)}>Carregar mais</Button></div>}
        </>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo produto" : "Editar produto"} size="lg">
        {editing !== null && <ProductForm product={editing === "new" ? null : editing} categories={knownCats} onSaved={onSaved} onCancel={() => setEditing(null)} minMarginBp={me.org.settings?.minMarginBp ?? null} />}
      </Dialog>
    </>
  );
}

function Price({ p }: { p: Product }) {
  const u = unitShort(p.unit);
  if (p.promoCents != null) return <><span className="text-ink-muted line-through">{p.regularCents != null ? money(p.regularCents) : ""}</span> <strong>{money(p.promoCents)}</strong>{u && `/${u}`}</>;
  if (p.regularCents != null) return <><strong>{money(p.regularCents)}</strong>{u && `/${u}`}</>;
  return <span className="text-ink-muted">Sem preço</span>;
}
function IssueBadges({ p }: { p: Product }) {
  const list = productIssues(p);
  if (!list.length) return <span className="text-xs text-success">Completo</span>;
  return <div className="mt-1 flex flex-wrap gap-1">{list.map((i) => <Badge key={i} tone="warning">{ISSUE_LABEL[i] ?? i}</Badge>)}</div>;
}
