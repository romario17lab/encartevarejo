"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { AuthCard, FormError, StrengthBar, useSubmit } from "@/components/app/auth";
import { api } from "@/lib/client/api";
import { SEGMENTS } from "@/lib/client/format";

export function SignupForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "", storeName: "", segment: "supermercado" });
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pwError = touched && f.password.length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : null;
  const { loading, error, onSubmit } = useSubmit(async () => {
    setTouched(true);
    if (f.password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    await api.post("/api/auth/signup", { ...f, orgName: f.storeName }, { noAuthRedirect: true });
    router.push("/app/loja?boasvindas=1");
  });
  return (
    <AuthCard title="Crie sua conta" subtitle="Leva 1 minuto. Depois você cadastra os produtos e gera o primeiro encarte."
      footer={<>Já tem conta? <Link className="font-semibold text-brand underline" href="/entrar">Entrar</Link></>}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input label="Seu nome" name="name" autoComplete="name" required value={f.name} onChange={set("name")} />
        <Input label="E-mail" name="email" type="email" autoComplete="email" required value={f.email} onChange={set("email")} />
        <div>
          <Input label="Senha" name="password" type="password" autoComplete="new-password" required minLength={8} value={f.password}
            onChange={set("password")} onBlur={() => setTouched(true)} error={pwError} />
          <StrengthBar password={f.password} />
        </div>
        <Input label="Nome da loja" name="storeName" required value={f.storeName} onChange={set("storeName")} hint="Aparece nos encartes. Você pode mudar depois." />
        <Select label="Segmento" name="segment" value={f.segment} onChange={set("segment")} options={SEGMENTS} />
        <FormError message={error} />
        <Button type="submit" size="lg" block loading={loading} disabled={!f.name || !f.email || !f.storeName}>Criar conta</Button>
      </form>
    </AuthCard>
  );
}
