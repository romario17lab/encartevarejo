"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AuthCard, FormError, useSubmit } from "@/components/app/auth";
import { api } from "@/lib/client/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { loading, error, onSubmit } = useSubmit(async () => {
    await api.post("/api/auth/forgot", { email }, { noAuthRedirect: true });
    setSent(true);
  });
  return (
    <AuthCard title="Esqueci minha senha" subtitle="Informe seu e-mail. Se houver uma conta com ele, enviaremos um link para criar uma nova senha."
      footer={<Link className="font-semibold text-brand underline" href="/entrar">Voltar para o login</Link>}>
      {sent ? (
        <p role="status" className="rounded-xl bg-success/10 px-3 py-3 text-sm text-ink">
          Pronto. Se <strong>{email}</strong> estiver cadastrado, você vai receber o link em alguns minutos. Confira também a caixa de spam.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError message={error} />
          <Button type="submit" size="lg" block loading={loading} disabled={!email}>Enviar link</Button>
        </form>
      )}
    </AuthCard>
  );
}
