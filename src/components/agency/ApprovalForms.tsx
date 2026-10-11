"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Card, cx, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";

/** Moldura simples da página pública de aprovação (sem menus do aplicativo). */
export function ApprovalShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <main id="conteudo" className={cx("mx-auto px-4 py-6 sm:py-10", wide ? "max-w-4xl" : "max-w-md")}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">{BRAND} · aprovação de prévia</p>
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </main>
  );
}

export function PinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(`/api/public-preview/${encodeURIComponent(token)}/pin`, { pin }, { noAuthRedirect: true });
      router.refresh();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">Quem enviou a prévia informou um PIN de 4 a 6 números junto com o link.</p>
        <Input label="PIN" inputMode="numeric" autoComplete="one-time-code" pattern="\d{4,6}" maxLength={6} required value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} error={error} />
        <Button type="submit" loading={busy} disabled={pin.length < 4}>Ver prévia</Button>
      </form>
    </Card>
  );
}

export function DecisionForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<null | "aprovado" | "alteracoes">(null);
  const [error, setError] = useState<string | null>(null);
  const send = async (decision: "aprovado" | "alteracoes") => {
    setError(null);
    if (name.trim().length < 2) { setError("Digite seu nome antes de responder."); return; }
    if (decision === "alteracoes" && comment.trim().length < 3) { setError("Descreva as alterações que você precisa."); return; }
    setBusy(decision);
    try {
      await api.post(`/api/public-preview/${encodeURIComponent(token)}/decision`, { name: name.trim(), decision, comment: comment.trim() || undefined }, { noAuthRedirect: true });
      router.refresh();
    } catch (err) { setError((err as Error).message); setBusy(null); }
  };
  return (
    <Card>
      <h2 className="font-display text-lg font-bold">Sua resposta</h2>
      <p className="mt-1 text-sm text-ink-muted">Sua resposta fica registrada para a equipe. A publicação ainda passa pela aprovação interna.</p>
      <div className="mt-4 flex flex-col gap-3">
        <Input label="Seu nome" required autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="Comentário" hint="Obrigatório para pedir alterações. Ex.: o preço do arroz é R$ 22,90." maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" loading={busy === "alteracoes"} disabled={!!busy} onClick={() => send("alteracoes")}>Pedir alterações</Button>
          <Button loading={busy === "aprovado"} disabled={!!busy} onClick={() => send("aprovado")}>Aprovar prévia</Button>
        </div>
      </div>
    </Card>
  );
}

export function DecisionRecorded({ decision, name, comment, at }: { decision: "aprovado" | "alteracoes"; name: string; comment: string | null; at: string }) {
  return (
    <Card role="status" className={decision === "aprovado" ? "border-success/40" : "border-warning/60"}>
      <h2 className="font-display text-lg font-bold">{decision === "aprovado" ? "Prévia aprovada" : "Alterações solicitadas"}</h2>
      <p className="mt-1 text-sm">Resposta de <strong>{name}</strong> em {at}.</p>
      {comment && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-alt p-3 text-sm">{comment}</p>}
      <p className="mt-2 text-xs text-ink-muted">A equipe foi avisada. Obrigado!</p>
    </Card>
  );
}
