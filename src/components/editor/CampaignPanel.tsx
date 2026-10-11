"use client";
import { Badge, Button, Input } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import type { PriceMode } from "@/domain/offer";
import { DefaultMechanic } from "./OfferEditor";
import type { PieceOverrides } from "@/domain/campaign";
import type { CampaignCore } from "@/lib/client/api";
import { fromDateInput, toDateInput, validityText } from "@/lib/client/format";

export function CampaignPanel({ campaign, onChange, template, onSwitchTemplate, onMigrate, onDuplicate, readOnly, canWrite, onApplyMode, itemCount }: {
  campaign: CampaignCore; onChange: (patch: Partial<CampaignCore>, key?: string) => void;
  template: { id: string; name: string; version: number; latestVersion: number };
  onSwitchTemplate: () => void; onMigrate: () => void; onDuplicate: () => void; readOnly?: boolean; canWrite: boolean;
  onApplyMode: (m: PriceMode) => void; itemCount: number;
}) {
  const o = campaign.overrides ?? {};
  const setO = (p: Partial<PieceOverrides>) => onChange({ overrides: { ...o, ...p } });
  const start = toDateInput(campaign.startsAt); const end = toDateInput(campaign.endsAt);
  const dateErr = !start || !end ? "Informe o início e o fim das ofertas." : end < start ? "A data final precisa ser depois da inicial." : null;
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <legend className="sr-only">Dados da campanha</legend>
        <Input label="Nome interno" value={campaign.name} maxLength={120} onChange={(e) => onChange({ name: e.target.value }, "c.name")} hint="Só a equipe vê." />
        <Input label="Título no material" value={campaign.title} maxLength={60} onChange={(e) => onChange({ title: e.target.value }, "c.title")} />
        <Input label="Subtítulo" value={campaign.subtitle ?? ""} maxLength={80} placeholder="Ex.: Só neste fim de semana!" onChange={(e) => onChange({ subtitle: e.target.value || null }, "c.subtitle")} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Início" type="date" required value={start} onChange={(e) => onChange({ startsAt: fromDateInput(e.target.value) })} />
          <Input label="Fim" type="date" required value={end} onChange={(e) => onChange({ endsAt: fromDateInput(e.target.value, true) })} error={dateErr} />
        </div>
        <Input label="Complemento da validade" value={campaign.validityNote ?? ""} maxLength={120} placeholder="ou enquanto durarem os estoques"
          onChange={(e) => onChange({ validityNote: e.target.value || null }, "c.validity")} hint={`No material: “${validityText(campaign.startsAt, campaign.endsAt, campaign.validityNote) || "sem validade informada"}”`} />
        <DefaultMechanic count={itemCount} onApply={onApplyMode} disabled={readOnly} />
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <span className="text-sm font-semibold">Ordem dos produtos</span>
          <div role="radiogroup" aria-label="Ordem dos produtos" className="grid grid-cols-2 gap-2">
            {([["manual", "Manual"], ["category", "Por categoria"]] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="order" className="h-5 w-5 accent-[rgb(var(--ev-brand))]" checked={(o.order ?? "manual") === v} onChange={() => setO({ order: v })} />{l}</label>
            ))}
          </div>
          {o.order === "category" && <Checkbox label="Mostrar nome da categoria" checked={!!o.showCategoryHeaders} onChange={(v) => setO({ showCategoryHeaders: v })} />}
        </div>
      </fieldset>

      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-semibold">Modelo</p>
        <p className="text-sm">{template.name} <Badge>versão {template.version}</Badge></p>
        {template.latestVersion > template.version && (
          <div className="mt-2 rounded-lg bg-brand-soft p-2 text-sm">
            <p>Há uma versão nova deste modelo (versão {template.latestVersion}). A campanha continua na versão {template.version} até você decidir.</p>
            {canWrite && !readOnly && <Button size="sm" className="mt-2" onClick={onMigrate}>Migrar para a versão nova</Button>}
          </div>
        )}
        {canWrite && !readOnly && <Button size="sm" variant="secondary" className="mt-2" onClick={onSwitchTemplate}>Trocar modelo</Button>}
        <p className="mt-1 text-xs text-ink-muted">Produtos, preços e ajustes são mantidos ao trocar.</p>
      </div>
      {canWrite && <Button variant="secondary" onClick={onDuplicate}>Duplicar campanha</Button>}
    </div>
  );
}
