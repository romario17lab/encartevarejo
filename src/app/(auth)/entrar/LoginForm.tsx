"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AuthCard, FormError, safeNext, useSubmit } from "@/components/app/auth";
import { api } from "@/lib/client/api";

export function LoginForm({ next, reset }: { next: string | null; reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { loading, error, onSubmit } = useSubmit(async () => {
    await api.post("/api/auth/login", { email, password }, { noAuthRedirect: true });
    // navegação completa: garante que o cookie novo vale para tudo
    window.location.assign(safeNext(next));
  });
  return (
    <AuthCard title="Entrar" footer={<>Ainda não tem conta? <Link className="font-semibold text-brand underline" href="/cadastro">Criar conta</Link></>}>
      {reset && <p role="status" className="mb-4 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">Senha redefinida. Entre com a nova senha.</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="E-mail" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Senha" type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" size="lg" block loading={loading} disabled={!email || !password}>Entrar</Button>
        <Link href="/esqueci-senha" className="text-center text-sm font-semibold text-brand underline">Esqueci minha senha</Link>
      </form>
    </AuthCard>
  );
}
