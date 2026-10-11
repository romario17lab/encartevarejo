"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Dialog, ErrorState, Input, toast } from "@/components/ui";
import { Checkbox, LoadingBlock, PageHeader, SectionTitle, confirmAction } from "@/components/app/common";
import { IconCopy, IconPlus, IconUpload } from "@/components/app/icons";
import { api } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

type Scope = "products.read" | "products.write" | "prices.write";
interface TokenRow { id: string; name: string; prefix: string; scopes: Scope[]; lastUsedAt: string | null; createdAt: string; revokedAt: string | null; createdByName: string | null; status: "ativo" | "revogado" }
interface TokensResponse { tokens: TokenRow[]; scopes: Record<Scope, string> }

export function IntegrationsPage() {
  const { can } = useMe();
  const isAdmin = can("org.manage");
  return (
    <>
      <PageHeader title="Integrações" description="Traga produtos e preços do seu sistema de gestão sem digitar de novo." />
      <Card className="border-brand/30 bg-brand-soft/40">
        <p className="text-sm">
          Conectamos com sistemas de gestão e estoque <strong>somente quando o sistema oferece uma API ou exporta um arquivo compatível</strong> (CSV ou XLSX).
          Não existe integração automática com qualquer sistema: confira com o fornecedor do seu sistema se ele exporta planilhas ou consegue chamar uma API.
          A importação manual de planilha continua disponível sempre.
        </p>
      </Card>

      <SectionTitle>1. Planilha exportada do sistema</SectionTitle>
      <Card>
        <p className="text-sm">Exporte o cadastro ou a lista de preços do seu sistema em CSV ou Excel e importe aqui. Salve as colunas como <strong>perfil de importação</strong> para reimportar toda semana em um passo.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/app/produtos/importar" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white"><IconUpload size={18} />Importar planilha</Link>
        </div>
      </Card>

      <SectionTitle>2. API para sistemas que fazem integração</SectionTitle>
      {isAdmin ? <TokensSection /> : (
        <Card><p className="text-sm text-ink-muted">Somente administradores da conta criam e revogam tokens de API.</p></Card>
      )}
      <ApiReference />
    </>
  );
}

function TokensSection() {
  const q = useApi<TokensResponse>("/api/api-tokens");
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null);
  const revoke = async (t: TokenRow) => {
    if (!confirmAction(`Revogar o token "${t.name}"? O sistema que usa este token deixa de conseguir acessar a conta na hora.`)) return;
    try { await api.del(`/api/api-tokens/${t.id}`); toast("Token revogado.", "success"); await q.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  };
  if (q.loading && !q.data) return <LoadingBlock />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  const data = q.data!;
  return (
    <Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Cada sistema deve ter o próprio token. O token dá acesso só a esta conta e só ao que você marcar.</p>
        <Button icon={<IconPlus size={18} />} onClick={() => setCreating(true)} className="shrink-0">Novo token</Button>
      </div>
      {!data.tokens.length ? <p className="mt-4 text-sm text-ink-muted">Nenhum token criado.</p> : (
        <ul className="mt-4 divide-y divide-line">
          {data.tokens.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">{t.name}<Badge tone={t.status === "ativo" ? "success" : "neutral"}>{t.status === "ativo" ? "Ativo" : "Revogado"}</Badge></p>
                <p className="break-all font-mono text-xs text-ink-muted">{t.prefix}_…</p>
                <p className="text-xs text-ink-muted">{t.scopes.map((s) => data.scopes[s] ?? s).join(" · ")}</p>
                <p className="text-xs text-ink-muted">Criado {fmtDateTime(t.createdAt)}{t.createdByName ? ` por ${t.createdByName}` : ""} · {t.lastUsedAt ? `último uso ${fmtDateTime(t.lastUsedAt)}` : "nunca usado"}{t.revokedAt ? ` · revogado ${fmtDateTime(t.revokedAt)}` : ""}</p>
              </div>
              {t.status === "ativo" && <Button size="sm" variant="secondary" onClick={() => revoke(t)}>Revogar</Button>}
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateTokenDialog scopes={data.scopes} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setShown(r); void q.reload(); }} />}
      <Dialog open={!!shown} onClose={() => setShown(null)} title="Copie o token agora" size="md" footer={<Button onClick={() => setShown(null)}>Já copiei</Button>}>
        {shown && <ShowToken token={shown.token} name={shown.name} />}
      </Dialog>
    </Card>
  );
}

function ShowToken({ token, name }: { token: string; name: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">Este é o token <strong>{name}</strong>. Por segurança ele <strong>não será mostrado de novo</strong>. Guarde-o no sistema que fará a integração; se perder, revogue e crie outro.</p>
      <div className="flex gap-2">
        <input readOnly value={token} aria-label="Token de API" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-alt px-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" icon={<IconCopy size={16} />} onClick={async () => {
          try { await navigator.clipboard.writeText(token); toast("Token copiado.", "success"); } catch { toast("Selecione e copie manualmente.", "error"); }
        }}>Copiar</Button>
      </div>
    </div>
  );
}

function CreateTokenDialog({ scopes, onClose, onCreated }: { scopes: Record<Scope, string>; onClose: () => void; onCreated: (r: { name: string; token: string }) => void }) {
  const [name, setName] = useState("");
  const [sel, setSel] = useState<Scope[]>(["products.read", "prices.write"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (s: Scope, on: boolean) => setSel((cur) => (on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)));
  const submit = async () => {
    setBusy(true); setError(null);
    try { const r = await api.post<{ name: string; token: string }>("/api/api-tokens", { name, scopes: sel }); onCreated(r); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Novo token de API" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={name.trim().length < 2 || !sel.length} onClick={submit}>Criar token</Button></>}>
      <div className="flex flex-col gap-3">
        <Input label="Nome" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sistema de gestão da loja" hint="Para saber depois qual sistema usa este token." />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Permissões</legend>
          {(Object.keys(scopes) as Scope[]).map((s) => (
            <Checkbox key={s} label={scopes[s]} description={s} checked={sel.includes(s)} onChange={(v) => toggle(s, v)} />
          ))}
        </fieldset>
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

function ApiReference() {
  const [origin, setOrigin] = useState("https://seu-endereco");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const ex = `curl -X PUT ${origin}/api/v1/products/prices \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"barcode":"7891000100103","regularCents":1290,"promoCents":999}]}'`;
  return (
    <Card className="mt-3">
      <h3 className="font-display text-base font-bold">Resumo da API v1</h3>
      <ul className="mt-2 space-y-1 text-sm">
        <li><code className="font-mono text-xs">GET /api/v1/stores</code> — lojas da conta (products.read)</li>
        <li><code className="font-mono text-xs">GET /api/v1/products</code> — produtos e preços, sem custo (products.read)</li>
        <li><code className="font-mono text-xs">PUT /api/v1/products/prices</code> — preços em lote por código de barras ou id, até 1000 linhas (prices.write)</li>
      </ul>
      <p className="mt-2 text-sm text-ink-muted">Valores em centavos inteiros (<code>regularCents: 1290</code>) ou texto decimal (<code>{'"regularPrice": "12.90"'}</code>). Códigos desconhecidos são informados na resposta e não viram produto, a menos que a linha traga nome, unidade e código e o token tenha products.write. Limite: 120 requisições por minuto por token.</p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-3 text-xs text-white"><code>{ex}</code></pre>
      <p className="mt-2 text-xs text-ink-muted">Documentação completa para quem desenvolve a integração: docs/06-integracoes.md.</p>
    </Card>
  );
}
