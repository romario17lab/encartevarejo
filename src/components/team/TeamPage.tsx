"use client";
import { useState } from "react";
import { Badge, Button, Card, Dialog, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { Checkbox, confirmAction, LoadingBlock, PageHeader, SectionTitle } from "@/components/app/common";
import { ROLE_LABEL, ROLES, type Role } from "@/domain/campaign";
import { api, ApiError, asList, type Invitation, type Member, type StoreSummary } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

const ROLE_HELP: Record<Role, string> = {
  admin: "Tudo, inclusive equipe, lojas, identidade e conta.",
  editor: "Cadastra produtos, monta campanhas e envia para revisão.",
  aprovador: "Revisa, aprova ou reprova e publica campanhas; vê o histórico.",
};
const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const INVITE_STATUS: Record<string, { label: string; tone: "warning" | "neutral" | "danger" | "success" }> = {
  pendente: { label: "Pendente", tone: "warning" }, expirado: { label: "Expirado", tone: "danger" }, aceito: { label: "Aceito", tone: "success" }, cancelado: { label: "Cancelado", tone: "neutral" },
};

interface OrgInfo { plan: { name: string; limits: { users: number; stores: number } }; usage: { members: number; pendingInvitations: number; stores: number } }
type InvitationRow = Invitation & { invitedByName?: string | null };

export function TeamPage() {
  const { can, me } = useMe();
  const manage = can("members.manage");
  const members = useApi<unknown>("/api/members");
  const invites = useApi<unknown>(manage ? "/api/invitations" : null);
  const stores = useApi<unknown>("/api/stores");
  const org = useApi<OrgInfo>("/api/org");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<{ email: string; url: string } | null>(null);
  const [access, setAccess] = useState<Member | null>(null);

  const storeList = asList<StoreSummary>(stores.data, "stores");
  const storeName = new Map(storeList.map((s) => [s.id, s.name]));
  const memberList = asList<Member>(members.data, "members");
  const inviteList = asList<InvitationRow>(invites.data, "invitations");
  const openInvites = inviteList.filter((i) => i.status === "pendente" || i.status === "expirado");
  const pastInvites = inviteList.filter((i) => i.status === "aceito" || i.status === "cancelado").slice(0, 10);
  const used = org.data ? org.data.usage.members + org.data.usage.pendingInvitations : null;
  const limit = org.data?.plan.limits.users ?? null;
  const atLimit = used != null && limit != null && used >= limit;

  const reloadAll = () => { void members.reload(); void invites.reload(); void org.reload(); };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setLastLink(null); setInviteError(null);
    try {
      const res = await api.post<{ acceptUrl?: string | null }>("/api/invitations", { email, role });
      toast(`Convite enviado para ${email}.`, "success");
      if (res.acceptUrl) setLastLink({ email, url: res.acceptUrl });
      setEmail(""); reloadAll();
    } catch (err) { setInviteError((err as Error).message); }
    finally { setSending(false); }
  };
  const changeRole = async (m: Member, r: Role) => {
    if (r === m.role) return;
    try { await api.patch(`/api/members/${m.userId}`, { role: r }); toast(`${m.name} agora é ${ROLE_LABEL[r]}.`, "success"); }
    catch (err) { toast((err as Error).message, "error"); }
    void members.reload();
  };
  const remove = async (m: Member) => {
    if (!confirmAction(`Remover ${m.name} da equipe? A pessoa perde o acesso imediatamente.`)) return;
    try { await api.del(`/api/members/${m.userId}`); toast(`${m.name} foi removido(a) da equipe.`, "success"); reloadAll(); }
    catch (err) { toast((err as Error).message, "error"); }
  };
  const revoke = async (i: Invitation) => {
    if (!confirmAction(`Cancelar o convite para ${i.email}? O link enviado deixa de funcionar.`)) return;
    try { await api.del(`/api/invitations/${i.id}`); toast("Convite cancelado.", "success"); reloadAll(); }
    catch (err) { toast((err as Error).message, "error"); }
  };
  const resend = async (i: Invitation) => {
    try {
      const res = await api.post<{ acceptUrl?: string | null }>(`/api/invitations/${i.id}/resend`, {});
      toast(`Convite reenviado para ${i.email}. O link anterior deixou de valer.`, "success");
      if (res.acceptUrl) setLastLink({ email: i.email, url: res.acceptUrl });
      reloadAll();
    } catch (err) { toast(err instanceof ApiError ? err.message : "Não foi possível reenviar.", "error"); }
  };
  const accessText = (m: Member) => !m.storeIds || m.storeIds.length === 0 ? "Todas as lojas"
    : m.storeIds.map((id) => storeName.get(id) ?? "loja removida").join(", ");

  return (
    <>
      <PageHeader title="Equipe" description="Quem pode editar, aprovar e publicar as campanhas, e em quais lojas." />
      {used != null && limit != null && (
        <p className="mb-4 text-sm text-ink-muted">
          {used} de {limit} usuário{limit === 1 ? "" : "s"} do plano {org.data!.plan.name} (membros e convites pendentes).
          {atLimit && manage && <span className="font-semibold text-ink"> Limite atingido: remova alguém, cancele um convite ou altere o plano.</span>}
        </p>
      )}
      {manage && (
        <Card>
          <h2 className="mb-3 font-display font-bold">Convidar pessoa</h2>
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Papel" value={role} onChange={(e) => setRole(e.target.value as Role)} options={roleOptions} />
            <Button type="submit" loading={sending} disabled={!email}>Enviar convite</Button>
          </form>
          <p className="mt-2 text-xs text-ink-muted">{ROLE_LABEL[role]}: {ROLE_HELP[role]} As lojas de acesso são definidas depois que a pessoa aceitar.</p>
          {inviteError && <p role="alert" className="mt-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm font-medium text-danger">{inviteError}</p>}
          {lastLink && (
            <div className="mt-3 rounded-xl bg-ink/5 p-3 text-xs">
              <p>Sem e-mail configurado: envie este link para <strong>{lastLink.email}</strong> (vale por 7 dias).</p>
              <p className="mt-1 break-all"><a className="text-brand underline" href={lastLink.url}>{lastLink.url}</a></p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => { void navigator.clipboard?.writeText(lastLink.url).then(() => toast("Link copiado.", "success"), () => toast("Não foi possível copiar.", "error")); }}>Copiar link</Button>
            </div>
          )}
        </Card>
      )}

      <SectionTitle>Membros</SectionTitle>
      {members.loading && !members.data ? <LoadingBlock /> : members.error ? <ErrorState message={members.error.message} onRetry={members.reload} /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {memberList.map((m) => {
            const you = m.isYou ?? m.userId === me.user.id;
            return (
              <li key={m.userId} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{m.name} {you && <Badge tone="brand">você</Badge>}</p>
                  <p className="truncate text-sm text-ink-muted">{m.email}</p>
                  <p className="mt-1 text-xs text-ink-muted">Lojas: <span className="text-ink">{accessText(m)}</span></p>
                </div>
                {manage && !you ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${m.userId}`}>Papel de {m.name}</label>
                    <select id={`role-${m.userId}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
                      {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {storeList.length > 1 && <Button size="sm" variant="secondary" onClick={() => setAccess(m)}>Lojas</Button>}
                    <Button size="sm" variant="ghost" onClick={() => remove(m)}>Remover</Button>
                  </div>
                ) : <Badge className="self-start md:self-auto">{ROLE_LABEL[m.role]}</Badge>}
              </li>
            );
          })}
        </ul>
      )}

      {manage && (
        <>
          <SectionTitle>Convites</SectionTitle>
          {invites.loading && !invites.data ? <LoadingBlock /> : invites.error ? <ErrorState message={invites.error.message} onRetry={invites.reload} /> : openInvites.length === 0 ? (
            <EmptyState title="Nenhum convite em aberto" description="Convites pendentes e expirados aparecem aqui para reenviar ou cancelar." />
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {openInvites.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold"><span className="truncate">{i.email}</span><Badge tone={INVITE_STATUS[i.status ?? "pendente"]!.tone}>{INVITE_STATUS[i.status ?? "pendente"]!.label}</Badge></p>
                    <p className="text-xs text-ink-muted">
                      {ROLE_LABEL[i.role]} · {i.status === "expirado" ? "expirou" : "expira"} em {fmtDate(i.expiresAt)}{i.invitedByName ? ` · convidado por ${i.invitedByName}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => resend(i)}>Reenviar</Button>
                    <Button size="sm" variant="ghost" onClick={() => revoke(i)}>Cancelar</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pastInvites.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-ink-muted">Convites aceitos ou cancelados ({pastInvites.length})</summary>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                {pastInvites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 p-3"><span className="min-w-0 truncate">{i.email} · {ROLE_LABEL[i.role]}</span><Badge tone={INVITE_STATUS[i.status!]!.tone}>{INVITE_STATUS[i.status!]!.label}</Badge></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {access && <StoreAccessDialog member={access} stores={storeList} onClose={() => setAccess(null)} onSaved={() => { setAccess(null); void members.reload(); }} />}
    </>
  );
}

function StoreAccessDialog({ member, stores, onClose, onSaved }: { member: Member; stores: StoreSummary[]; onClose: () => void; onSaved: () => void }) {
  const [all, setAll] = useState(!member.storeIds || member.storeIds.length === 0);
  const [sel, setSel] = useState<string[]>(member.storeIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      await api.patch(`/api/members/${member.userId}`, { storeIds: all ? null : sel });
      toast(all ? `${member.name} acessa todas as lojas.` : `Acesso de ${member.name} atualizado.`, "success");
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Lojas de ${member.name}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} disabled={!all && sel.length === 0} onClick={save}>Salvar acesso</Button></>}>
      <div className="flex flex-col gap-3" role="radiogroup" aria-label="Acesso às lojas">
        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input type="radio" name="acc" checked={all} onChange={() => setAll(true)} className="mt-1 h-5 w-5" />
          <span><span className="font-semibold">Todas as lojas</span><span className="block text-sm text-ink-muted">Inclui filiais cadastradas no futuro.</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input type="radio" name="acc" checked={!all} onChange={() => setAll(false)} className="mt-1 h-5 w-5" />
          <span><span className="font-semibold">Somente as lojas escolhidas</span><span className="block text-sm text-ink-muted">A pessoa não vê campanhas, preços nem histórico das outras lojas.</span></span>
        </label>
        {!all && (
          <ul className="flex flex-col gap-2 pl-2">
            {stores.map((s) => (
              <li key={s.id}><Checkbox label={s.name} checked={sel.includes(s.id)} onChange={(v) => setSel((c) => (v ? [...c, s.id] : c.filter((x) => x !== s.id)))} /></li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
