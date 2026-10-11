"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { AuthCard, FormError, StrengthBar, useSubmit } from "@/components/app/auth";
import { api } from "@/lib/client/api";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const { loading, error, onSubmit } = useSubmit(async () => {
    if (pw.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    if (pw !== pw2) throw new Error("As senhas não conferem.");
    await api.post("/api/auth/reset", { token, password: pw }, { noAuthRedirect: true });
    router.push("/entrar?senha=redefinida");
  });
  if (!token) {
    return (
      <AuthCard title="Link inválido" subtitle="Este link de redefinição está incompleto ou expirou.">
        <Link href="/esqueci-senha" className="font-semibold text-brand underline">Pedir um novo link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Crie uma nova senha">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Input label="Nova senha" type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
          <StrengthBar password={pw} />
        </div>
        <Input label="Repita a nova senha" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)}
          error={pw2 && pw !== pw2 ? "As senhas não conferem." : null} />
        <FormError message={error} />
        <Button type="submit" size="lg" block loading={loading}>Salvar nova senha</Button>
      </form>
    </AuthCard>
  );
}
