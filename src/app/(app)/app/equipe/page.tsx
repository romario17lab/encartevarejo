"use client";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, toast } from "@/components/ui";
import { confirmAction, LoadingBlock, PageHeader, SectionTitle } from "@/components/app/common";
import { ROLE_LABEL, ROLES, type Role } from "@/domain/campaign";
import { api, asList, type Invitation, type Member } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { useApi, useMe } from "@/lib/client/hooks";

const ROLE_HELP: Record<Role, string> = {
  admin: "Tudo, inclusive equipe, lojas, identidade e conta.",
  editor: "Cadastra produtos, monta campanhas e envia para revisão.",
  aprovador: "Revisa, aprova ou reprova e publica campanhas.",
};
const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export default function TeamPage() {
  const { can, me } = useMe();
  const manage = can("members.manage");
  const members = useApi<unknown>("/api/members");
  const invites = useApi<unknown>(manage ? "/api/invitations" : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setLastLink(null);
    try {
      const res = await api.post<{ acceptUrl?: string; url?: string }>("/api/invitations", { email, role });
      toast(`Convite enviado para ${email}.`, "success");
      setLastLink(res.acceptUrl ?? res.url ?? null);
      setEmail(""); void invites.reload();
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setSending(false); }
  };
  const changeRole = async (m: Member, r: Role) => {
    try { await api.patch(`/api/members/${m.userId}`, { role: r }); toast("Papel atualizado.", "success"); void members.reload(); }
    catch (err) { toast((err as Error).message, "error"); void members.reload(); }
  };
  const remove = async (m: Member) => {
    if (!confirmAction(`Remover ${m.name} da equipe? A pessoa perde o acesso imediatamente.`)) return;
    try { await api.del(`/api/members/${m.userId}`); toast("Acesso revogado.", "success"); void members.reload(); }
    catch (err) { toast((err as Error).message, "error"); }
  };
  const revoke = async (i: Invitation) => {
    try { await api.del(`/api/invitations/${i.id}`); toast("Convite cancelado.", "success"); void invites.reload(); }
    catch (err) { toast((err as Error).message, "error"); }
  };
  const memberList = asList<Member>(members.data, "members");
  const pending = asList<Invitation>(invites.data, "invitations").filter((i) => (i.status ? i.status === "pendente" : !i.acceptedAt && !i.revokedAt));

  return (
    <>
      <PageHeader title="Equipe" description="Quem pode editar, aprovar e publicar as campanhas." />
      {manage && (
        <Card>
          <h2 className="mb-3 font-display font-bold">Convidar pessoa</h2>
          <form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Papel" value={role} onChange={(e) => setRole(e.target.value as Role)} options={roleOptions} />
            <Button type="submit" loading={sending} disabled={!email}>Enviar convite</Button>
          </form>
          <p className="mt-2 text-xs text-ink-muted">{ROLE_LABEL[role]}: {ROLE_HELP[role]}</p>
          {lastLink && <p className="mt-2 break-all text-xs">Link do convite: <a className="text-brand underline" href={lastLink}>{lastLink}</a></p>}
        </Card>
      )}

      <SectionTitle>Membros</SectionTitle>
      {members.loading ? <LoadingBlock /> : members.error ? <ErrorState message={members.error.message} onRetry={members.reload} /> : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {memberList.map((m) => {
            const you = m.isYou ?? m.userId === me.user.id;
            return (
              <li key={m.userId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{m.name} {you && <Badge tone="brand">você</Badge>}</p>
                  <p className="truncate text-sm text-ink-muted">{m.email}</p>
                </div>
                {manage && !you ? (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${m.userId}`}>Papel de {m.name}</label>
                    <select id={`role-${m.userId}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
                      {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)}>Remover</Button>
                  </div>
                ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}
              </li>
            );
          })}
        </ul>
      )}

      {manage && (
        <>
          <SectionTitle>Convites pendentes</SectionTitle>
          {invites.loading ? <LoadingBlock /> : invites.error ? <ErrorState message={invites.error.message} onRetry={invites.reload} /> : pending.length === 0 ? (
            <EmptyState title="Nenhum convite pendente" />
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {pending.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0"><p className="truncate font-semibold">{i.email}</p><p className="text-xs text-ink-muted">{ROLE_LABEL[i.role]} · expira em {fmtDate(i.expiresAt)}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => revoke(i)}>Cancelar</Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
