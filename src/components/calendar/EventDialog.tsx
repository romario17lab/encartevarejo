"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, Input, Textarea, toast } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { longDate, newCampaignHref, suggestedPeriodFor, dmy } from "./dates";
import { IconMovable, type CalEvent } from "./shared";

type Mode = "view" | "form" | "confirm";
type FieldErrors = Partial<Record<"name" | "date" | "note", string>>;

/**
 * Detalhes de uma data (comercial ou da conta) e formulário de criação/edição de evento da conta.
 * - `event` null  → criar (abre direto no formulário, com `defaultDate`)
 * - evento global → somente leitura (com "Criar campanha")
 */
export function EventDialog({ open, onClose, event, defaultDate, today, canEdit, canCreateCampaign, onSaved }: {
  open: boolean; onClose: () => void; event: CalEvent | null; defaultDate?: string; today: string;
  canEdit: boolean; canCreateCampaign: boolean; onSaved: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(event ? "view" : "form");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(event ? "view" : "form");
    setName(event?.name ?? "");
    setDate(event?.date ?? defaultDate ?? today);
    setNote(event?.note ?? "");
    setErrors({}); setFormError(null); setBusy(false);
  }, [open, event, defaultDate, today]);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!name.trim()) e.name = "Informe o nome do evento.";
    else if (name.trim().length > 80) e.name = "Use no máximo 80 caracteres.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = "Escolha uma data válida.";
    if (note.trim().length > 200) e.note = "Use no máximo 200 caracteres.";
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e); setFormError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), date, note: note.trim() || null };
      if (event) await api.patch(`/api/calendar/${event.id}`, body);
      else await api.post("/api/calendar", body);
      onSaved(event ? "Evento atualizado." : "Evento adicionado ao calendário.");
      onClose();
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? (err.details as Array<{ path: string; message: string }>) : [];
      const fe: FieldErrors = {};
      for (const d of details) if (d.path === "name" || d.path === "date" || d.path === "note") fe[d.path] = d.message;
      setErrors(fe);
      setFormError(Object.keys(fe).length ? null : (err as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!event) return;
    setBusy(true);
    try {
      await api.del(`/api/calendar/${event.id}`);
      onSaved("Evento excluído.");
      onClose();
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
      setMode("view");
    }
  };

  if (!open) return null;

  if (mode === "form") {
    return (
      <Dialog open={open} onClose={onClose} title={event ? "Editar evento" : "Novo evento da conta"}
        footer={<>
          <Button variant="secondary" onClick={event ? () => setMode("view") : onClose} disabled={busy}>{event ? "Voltar" : "Cancelar"}</Button>
          <Button onClick={save} loading={busy}>{event ? "Salvar alterações" : "Adicionar evento"}</Button>
        </>}>
        <form className="flex flex-col gap-3" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="text-sm text-ink-muted">Eventos da conta aparecem só para a sua equipe. Ex.: aniversário da loja, feira de vinhos, inauguração.</p>
          <Input label="Nome do evento" required value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} error={errors.name}
            hint={`${name.trim().length}/80`} />
          <Input label="Data" type="date" required value={date} min="2000-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Textarea label="Observação (opcional)" value={note} maxLength={200} rows={3} onChange={(e) => setNote(e.target.value)} error={errors.note}
            hint={`${note.trim().length}/200`} />
          {formError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm font-medium text-danger">{formError}</p>}
          <button type="submit" className="sr-only" tabIndex={-1}>Salvar</button>
        </form>
      </Dialog>
    );
  }

  if (!event) return null;
  const global = event.scope === "global";
  const year = event.date.slice(0, 4);
  const period = suggestedPeriodFor(event.date, today);
  const canCampaign = canCreateCampaign && event.date >= today;

  if (mode === "confirm") {
    return (
      <Dialog open={open} onClose={onClose} title="Excluir evento?" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={remove} loading={busy}>Excluir evento</Button>
        </>}>
        <p className="text-sm">O evento <strong>{event.name}</strong> ({dmy(event.date)}) sai do calendário da conta. Campanhas não são afetadas.</p>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={event.name}
      footer={<>
        {event.editable && <Button variant="ghost" className="text-danger" onClick={() => setMode("confirm")}>Excluir</Button>}
        {event.editable && <Button variant="secondary" onClick={() => setMode("form")}>Editar</Button>}
        {canCampaign && (
          <Link href={newCampaignHref(period.inicio, period.fim)} className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong">
            Criar campanha para esta data
          </Link>
        )}
      </>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="font-semibold first-letter:uppercase">{longDate(event.date)}</p>
        <div className="flex flex-wrap gap-1.5">
          {global ? <Badge tone="warning">Data comercial · calendário padrão</Badge> : <Badge tone="brand">Evento da conta</Badge>}
          {event.isMovable && <Badge tone="neutral"><IconMovable size={12} />Data móvel</Badge>}
        </div>
        {event.note && <p>{event.note}</p>}
        {event.isMovable && <p className="text-ink-muted">A data muda a cada ano e foi calculada para {year} (as datas da Páscoa, do Carnaval e do Corpus Christi seguem o calendário litúrgico; Dia das Mães, dos Pais e Black Friday seguem a regra do dia da semana).</p>}
        {global && <p className="text-ink-muted">Datas do calendário padrão não podem ser editadas.{canEdit ? " Para registrar uma data diferente, crie um evento da conta." : ""}</p>}
        {!global && !event.editable && <p className="text-ink-muted">Seu papel permite apenas visualizar os eventos da conta.</p>}
        {canCampaign && <p className="text-ink-muted">Sugestão de período: {dmy(period.inicio)} a {dmy(period.fim)}. Você pode ajustar ao criar.</p>}
      </div>
    </Dialog>
  );
}
