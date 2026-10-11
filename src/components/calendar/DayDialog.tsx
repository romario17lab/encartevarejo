"use client";
import Link from "next/link";
import { Button, Dialog } from "@/components/ui";
import { IconPlus } from "@/components/app/icons";
import { addDaysYmd, longDate, newCampaignHref } from "./dates";
import { CampaignCard, EventChip, type CalEvent, type PlacedCampaign } from "./shared";

/** Tudo o que acontece em um dia + ações (criar campanha, adicionar evento). */
export function DayDialog({ day, onClose, events, campaigns, today, canEdit, canCreateCampaign, onOpenEvent, onAddEvent }: {
  day: string | null; onClose: () => void; events: CalEvent[]; campaigns: PlacedCampaign[]; today: string;
  canEdit: boolean; canCreateCampaign: boolean; onOpenEvent: (e: CalEvent) => void; onAddEvent: (date: string) => void;
}) {
  if (!day) return null;
  const evs = events.filter((e) => e.date === day);
  const camps = campaigns.filter((c) => c.start <= day && c.end >= day);
  const future = day >= today;
  return (
    <Dialog open onClose={onClose} title={longDate(day).replace(/^./, (c) => c.toUpperCase())}
      footer={<>
        {canEdit && <Button variant="secondary" className="whitespace-nowrap" icon={<IconPlus size={18} />} onClick={() => onAddEvent(day)}>Adicionar evento</Button>}
        {canCreateCampaign && future && (
          <Link href={newCampaignHref(day, addDaysYmd(day, 6))} className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong">
            <IconPlus size={18} />Criar campanha neste dia
          </Link>
        )}
      </>}>
      <div className="flex flex-col gap-4">
        <section aria-labelledby="dd-datas">
          <h3 id="dd-datas" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Datas e eventos</h3>
          {evs.length ? <ul className="flex flex-col gap-1.5">{evs.map((e) => <li key={e.id}><EventChip ev={e} onClick={() => onOpenEvent(e)} /></li>)}</ul>
            : <p className="text-sm text-ink-muted">Nenhuma data comercial ou evento neste dia.</p>}
        </section>
        <section aria-labelledby="dd-camp">
          <h3 id="dd-camp" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Campanhas válidas neste dia</h3>
          {camps.length ? <ul className="flex flex-col gap-1.5">{camps.map((c) => <li key={c.id}><CampaignCard c={c} /></li>)}</ul>
            : <p className="text-sm text-ink-muted">Nenhuma campanha neste dia.</p>}
        </section>
        {canCreateCampaign && future && <p className="text-xs text-ink-muted">A nova campanha começa com o período de 7 dias a partir desta data; você pode ajustar antes de gerar.</p>}
      </div>
    </Dialog>
  );
}
