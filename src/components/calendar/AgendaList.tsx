"use client";
import { cx } from "@/components/ui";
import { dayNum, monthOf, shortDate, weekday, WEEKDAYS_SHORT } from "./dates";
import { CampaignCard, EventChip, type CalEvent, type PlacedCampaign } from "./shared";

/** Agenda do mês (celular): semanas → campanhas da semana + dias com datas. Alvos de toque ≥ 44 px. */
export function AgendaList({ month, weeks, events, campaigns, today, onOpenDay, onOpenEvent }: {
  month: string; weeks: string[][]; events: CalEvent[]; campaigns: PlacedCampaign[]; today: string;
  onOpenDay: (d: string) => void; onOpenEvent: (e: CalEvent) => void;
}) {
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return (
    <ol className="flex flex-col gap-4" aria-label="Agenda do mês por semana">
      {weeks.map((week) => {
        const days = week.filter((d) => monthOf(d) === month);
        if (!days.length) return null;
        const ws = days[0], we = days[days.length - 1];
        const camps = campaigns.filter((c) => c.start <= we && c.end >= ws);
        const activeDays = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0 || d === today);
        const headingId = `sem-${ws}`;
        return (
          <li key={ws} aria-labelledby={headingId} className="rounded-2xl border border-line bg-surface p-3 shadow-card">
            <h3 id={headingId} className="mb-2 flex items-baseline justify-between gap-2 font-display text-base font-bold">
              <span>{ws === we ? shortDate(ws) : `${shortDate(ws)} – ${shortDate(we)}`}</span>
              {ws <= today && today <= we && <span className="text-xs font-semibold text-brand-strong">Esta semana</span>}
            </h3>
            {camps.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Campanhas ({camps.length})</p>
                <ul className="flex flex-col gap-1.5">{camps.map((c) => <li key={c.id}><CampaignCard c={c} /></li>)}</ul>
              </div>
            )}
            {activeDays.length > 0 ? (
              <ul className="flex flex-col divide-y divide-line">
                {activeDays.map((d) => {
                  const evs = byDay.get(d) ?? [];
                  const isToday = d === today;
                  return (
                    <li key={d} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                      <button type="button" onClick={() => onOpenDay(d)} aria-label={`Ver o dia ${shortDate(d)}${isToday ? " (hoje)" : ""}`} aria-current={isToday ? "date" : undefined}
                        className={cx("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center",
                          isToday ? "border-brand bg-brand text-white" : "border-line bg-surface-alt text-ink hover:border-brand")}>
                        <span className="text-[11px] font-semibold uppercase">{WEEKDAYS_SHORT[weekday(d)]}</span>
                        <span className="text-lg font-bold leading-none">{dayNum(d)}</span>
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        {evs.length ? evs.map((e) => <EventChip key={e.id} ev={e} onClick={() => onOpenEvent(e)} />)
                          : <button type="button" onClick={() => onOpenDay(d)} className="flex min-h-[44px] items-center rounded-lg px-1 text-left text-sm text-ink-muted hover:text-ink">Hoje · nada marcado. Toque para planejar.</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : camps.length === 0 ? <p className="text-sm text-ink-muted">Nada programado nesta semana.</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
