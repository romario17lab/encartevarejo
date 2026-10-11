"use client";
import { useState } from "react";
import { Button, Dialog, Input, Select, toast } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import { api, ApiError, type Store } from "@/lib/client/api";
import { WEEKDAYS } from "@/lib/client/format";
import { fmtWhats, type BranchKit, type BranchStore } from "./types";

type Hours = Record<string, { open: string; close: string; closed: boolean }>;
function initialHours(h: Store["hours"] | undefined): Hours {
  const has = h && Object.keys(h).length > 0;
  return Object.fromEntries(WEEKDAYS.map((_, i) => {
    const v = h?.[String(i)];
    if (!has) return [String(i), { open: "08:00", close: "20:00", closed: i === 0 }];
    const m = v?.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    return [String(i), m ? { open: m[1]!, close: m[2]!, closed: false } : { open: "08:00", close: "20:00", closed: true }];
  }));
}

/** Diálogo de cadastro/edição de filial. `store` ausente = nova filial. */
export function BranchForm({ open, onClose, store, kits, onSaved, limitText }: {
  open: boolean; onClose: () => void; store: BranchStore | null; kits: BranchKit[]; onSaved: (s: Store, created: boolean) => void; limitText?: string | null;
}) {
  const editing = !!store;
  const [f, setF] = useState(() => ({
    name: store?.name ?? "", slug: store?.slug ?? "", phone: store?.phone ?? "", whatsapp: fmtWhats(store?.whatsapp), email: store?.email ?? "",
    address: { ...(store?.address ?? {}) }, hoursNote: store?.hoursNote ?? "",
    brandKitId: store?.brandKitId ?? kits.find((k) => k.isDefault)?.id ?? kits[0]?.id ?? "",
  }));
  const [hours, setHours] = useState<Hours>(() => initialHours(store?.hours));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const addr = (k: keyof Store["address"]) => ({ value: f.address[k] ?? "", error: errors[`address.${k}`], onChange: (e: { target: { value: string } }) => setF({ ...f, address: { ...f.address, [k]: e.target.value } }) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Informe o nome da filial.";
    for (const [d, h] of Object.entries(hours)) if (!h.closed && h.open >= h.close) errs[`h${d}`] = "O fechamento precisa ser depois da abertura.";
    setErrors(errs); setFormError(null);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: f.name, phone: f.phone || null, whatsapp: f.whatsapp, email: f.email, address: f.address, hoursNote: f.hoursNote || null,
        hours: Object.fromEntries(Object.entries(hours).map(([d, h]) => [d, h.closed ? null : `${h.open}-${h.close}`])),
        brandKitId: f.brandKitId || undefined,
      };
      if (f.slug.trim() && (!editing || f.slug.trim() !== store?.slug)) body.slug = f.slug.trim().toLowerCase();
      const res = editing ? await api.patch<Store>(`/api/stores/${store!.id}`, body) : await api.post<Store>("/api/stores", body);
      toast(editing ? "Filial atualizada." : `Filial “${res.name}” cadastrada.`, "success");
      onSaved(res, !editing);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const fe: Record<string, string> = {};
        for (const d of err.details as Array<{ path: string; message: string }>) fe[d.path] = d.message;
        setErrors(fe);
      }
      setFormError((err as Error).message);
    } finally { setSaving(false); }
  };

  const kitOptions = kits.map((k) => ({ value: k.id, label: `${k.name}${k.isDefault ? " (padrão da conta)" : ""}${k.storeCount ? ` · usada em ${k.storeCount} loja${k.storeCount > 1 ? "s" : ""}` : ""}` }));

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `Editar ${store!.name}` : "Nova filial"} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="branch-form" loading={saving}>{editing ? "Salvar filial" : "Cadastrar filial"}</Button></>}>
      <form id="branch-form" onSubmit={save} className="flex flex-col gap-4" noValidate>
        {!editing && limitText && <p className="rounded-xl bg-ink/5 p-3 text-sm">{limitText}</p>}
        {formError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm font-medium text-danger">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome da filial" required value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Mercado Exemplo – Centro" />
          <Input label="Endereço da vitrine" value={f.slug} error={errors.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder={editing ? "" : "gerado a partir do nome"}
            hint={`Link público: /loja/${f.slug || "…"}. Letras minúsculas, números e hífen.`} />
        </div>
        <Select label="Identidade visual" value={f.brandKitId} onChange={(e) => setF({ ...f, brandKitId: e.target.value })} options={kitOptions}
          hint="Logo, cores e texto legal são compartilhados entre as lojas que usam a mesma identidade. Endereço, contatos e preços são de cada filial." />
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 font-display font-bold">Contatos</legend>
          <Input label="Telefone" type="tel" value={f.phone} error={errors.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 3333-4444" />
          <Input label="WhatsApp" type="tel" value={f.whatsapp} error={errors.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="(11) 99999-0000" />
          <Input label="E-mail" type="email" value={f.email} error={errors.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="mb-2 font-display font-bold">Endereço</legend>
          <div className="sm:col-span-4"><Input label="Rua / avenida" {...addr("street")} /></div>
          <div className="sm:col-span-2"><Input label="Número" {...addr("number")} /></div>
          <div className="sm:col-span-3"><Input label="Bairro" {...addr("district")} /></div>
          <div className="sm:col-span-3"><Input label="Complemento" {...addr("complement")} /></div>
          <div className="sm:col-span-3"><Input label="Cidade" {...addr("city")} /></div>
          <div className="sm:col-span-1"><Input label="UF" maxLength={2} {...addr("state")} /></div>
          <div className="sm:col-span-2"><Input label="CEP" inputMode="numeric" {...addr("zip")} /></div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-display font-bold">Horário de funcionamento</legend>
          <ul className="flex flex-col gap-3">
            {WEEKDAYS.map((day, i) => {
              const h = hours[String(i)]!;
              const set = (p: Partial<typeof h>) => setHours({ ...hours, [String(i)]: { ...h, ...p } });
              return (
                <li key={day} className="grid grid-cols-[84px_1fr] items-center gap-2 sm:grid-cols-[110px_110px_1fr]">
                  <span className="text-sm font-semibold">{day}</span>
                  <Checkbox label="Fechado" checked={h.closed} onChange={(v) => set({ closed: v })} />
                  {!h.closed && (
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      <label className="sr-only" htmlFor={`bo${i}`}>Abre às ({day})</label>
                      <input id={`bo${i}`} type="time" value={h.open} onChange={(e) => set({ open: e.target.value })} className="h-10 rounded-lg border border-line bg-surface px-2" />
                      <span aria-hidden>às</span>
                      <label className="sr-only" htmlFor={`bc${i}`}>Fecha às ({day})</label>
                      <input id={`bc${i}`} type="time" value={h.close} onChange={(e) => set({ close: e.target.value })} className="h-10 rounded-lg border border-line bg-surface px-2" />
                    </div>
                  )}
                  {errors[`h${i}`] && <p className="col-span-full text-sm text-danger">{errors[`h${i}`]}</p>}
                </li>
              );
            })}
          </ul>
          <div className="mt-3"><Input label="Observação de horário" value={f.hoursNote} onChange={(e) => setF({ ...f, hoursNote: e.target.value })} placeholder="Ex.: Feriados das 8h às 13h" maxLength={120} /></div>
        </fieldset>
      </form>
    </Dialog>
  );
}
