"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { AuthCard, FormError, StrengthBar, useSubmit } from "@/components/app/auth";
import { api, ApiError, type Me } from "@/lib/client/api";

// Aceite de convite: se já estiver logado, aceita direto; se não, cria a conta (nome + senha) junto.
export function AcceptInvite({ token }: { token: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [existing, setExisting] = useState(false);
  useEffect(() => {
    api.get<Me>("/api/me", { noAuthRedirect: true }).then(setMe).catch(() => setMe(null));
  }, []);
  const { loading, error, onSubmit } = useSubmit(async () => {
    if (!me && existing) {
      // usuário já cadastrado: a senha da conta confirma a identidade e o servidor abre a sessão
      await api.post("/api/invitations/accept", { token, password }, { noAuthRedirect: true });
    } else if (me) {
      await api.post("/api/invitations/accept", { token }, { noAuthRedirect: true });
    } else {
      if (password.length < 8) throw new ApiError(422, "validation", "A senha precisa ter pelo menos 8 caracteres.");
      await api.post("/api/invitations/accept", { token, name, password }, { noAuthRedirect: true });
    }
    window.location.assign("/app");
  });
  if (!token) return <AuthCard title="Convite inválido" subtitle="O link do convite está incompleto. Peça um novo convite ao administrador da conta." />;
  if (me === undefined) return <div className="flex justify-center p-10"><Spinner /></div>;
  return (
    <AuthCard title="Você foi convidado" subtitle="Aceite o convite para participar da conta e editar as campanhas da equipe.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {me ? (
          <p className="text-sm">Você está conectado como <strong>{me.user.email}</strong>. O convite precisa ter sido enviado para este e-mail.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Você já tem conta?" className="grid grid-cols-2 gap-2">
              {[{ v: false, l: "Sou novo aqui" }, { v: true, l: "Já tenho conta" }].map((o) => (
                <button type="button" key={o.l} role="radio" aria-checked={existing === o.v} onClick={() => setExisting(o.v)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${existing === o.v ? "border-brand bg-brand-soft text-brand-strong" : "border-line"}`}>{o.l}</button>
              ))}
            </div>
            {existing ? (
              <>
                <p className="text-sm text-ink-muted">Use a senha da conta cadastrada com o e-mail que recebeu o convite.</p>
                <Input label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </>
            ) : (
              <>
                <Input label="Seu nome" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
                <div>
                  <Input label="Crie uma senha" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <StrengthBar password={password} />
                </div>
              </>
            )}
          </>
        )}
        <FormError message={error} />
        <Button type="submit" size="lg" block loading={loading}>Aceitar convite</Button>
        <Link href="/" className="text-center text-sm text-ink-muted underline">Agora não</Link>
      </form>
    </AuthCard>
  );
}
