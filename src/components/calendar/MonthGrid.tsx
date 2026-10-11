"use client";
import Link from "next/link";
import { cx } from "@/components/ui";
import { dayNum, longDate, monthOf, WEEKDAYS_SHORT } from "./dates";
import { EventChip, STATUS_STYLE, statusLabel, periodText, type CalEvent, type PlacedCampaign } from "./shared";

const MAX_LANES = 3;

interface Segment { c: PlacedCampaign; c0: number; c1: number; lane: number; startsHere: boolean; endsHere: boolean }

/** Distribui as campanhas da semana em faixas (lanes) sem sobreposição. */
function layoutWeek(week: string[], campaigns: PlacedCampaign[]): Segment[] {
  const ws = week[0], we = week[6];
  const inWeek = campaigns.filter((c) => c.start <= we && c.end >= ws)
    .map((c) => ({ c, c0: Math.max(0, week.indexOf(c.start < ws ? ws : c.start)), c1: week.indexOf(c.end > we ? we : c.end) }))
    .sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0));
  const laneEnds: number[] = [];
  return inWeek.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.c0);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.c1); } else laneEnds[lane] = s.c1;
    return { ...s, lane, startsHere: s.c.start >= ws, endsHere: s.c.end <= we };
  });
}

/** Visão mensal (telas largas). */
export function MonthGrid({ month, weeks, events, campaigns, today, onOpenDay, onOpenEvent }: {
  month: string; weeks: string[][]; events: CalEvent[]; campaigns: PlacedCampaign[]; today: string;
  onOpenDay: (d: string) => void; onOpenEvent: (e: CalEvent) => void;
}) {
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line bg-surface-alt" aria-hidden>
        {WEEKDAYS_SHORT.map((w) => <div key={w} className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{w}</div>)}
      </div>
      <ol aria-label="Semanas do mês" className="divide-y divide-line">
        {weeks.map((week) => {
          const segs = layoutWeek(week, campaigns);
          const shown = segs.filter((s) => s.lane < MAX_LANES);
          const lanes = Math.min(MAX_LANES, segs.reduce((m, s) => Math.max(m, s.lane + 1), 0));
          const hiddenPerDay = week.map((_, i) => segs.filter((s) => s.lane >= MAX_LANES && s.c0 <= i && s.c1 >= i).length);
          return (
            <li key={week[0]} className="grid grid-cols-7" style={{ gridTemplateRows: `auto ${lanes ? `repeat(${lanes}, auto) ` : ""}1fr` }}>
              {week.map((d, i) => (
                <div key={`bg-${d}`} aria-hidden style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  className={cx("min-h-[120px] border-line", i > 0 && "border-l", monthOf(d) !== month && "bg-surface-alt/70", d === today && "bg-brand-soft/40")} />
              ))}
              {week.map((d, i) => {
                const evs = byDay.get(d) ?? [];
                const camps = segs.filter((s) => s.c0 <= i && s.c1 >= i).length;
                const parts = [evs.length && `${evs.length} ${evs.length === 1 ? "data" : "datas"}`, camps && `${camps} ${camps === 1 ? "campanha" : "campanhas"}`].filter(Boolean).join(", ");
                return (
                  <div key={`h-${d}`} style={{ gridColumn: i + 1, gridRow: 1 }} className="relative px-1.5 pt-1.5">
                    <button type="button" onClick={() => onOpenDay(d)} aria-label={`${longDate(d)}${d === today ? " (hoje)" : ""}${parts ? `: ${parts}` : ""}. Ver detalhes do dia`}
                      aria-current={d === today ? "date" : undefined}
                      className={cx("inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold hover:bg-ink/10",
                        d === today ? "bg-brand text-white hover:bg-brand-strong" : monthOf(d) !== month ? "text-ink-muted" : "text-ink")}>
                      {dayNum(d)}
                    </button>
                  </div>
                );
              })}
              {shown.map((s) => (
                <Link key={`${s.c.id}-${week[0]}`} href={`/app/campanhas/${s.c.id}`}
                  style={{ gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: 2 + s.lane }}
                  title={`${s.c.name} · ${statusLabel(s.c.status)} · ${periodText(s.c)}${s.c.storeName ? ` · ${s.c.storeName}` : ""}`}
                  className={cx("relative z-10 mt-1 flex min-h-[26px] min-w-0 items-center gap-1 px-1.5 text-xs font-semibold hover:brightness-95",
                    STATUS_STYLE[s.c.status], s.startsHere ? "ml-1 rounded-l-md border-l-4" : "ml-0", s.endsHere ? "mr-1 rounded-r-md" : "mr-0")}>
                  {!s.startsHere && <span aria-hidden>…</span>}
                  <span className="min-w-0 truncate">{s.c.name}</span>
                  {s.c1 - s.c0 >= 1 && <span className="ml-auto shrink-0 rounded bg-surface/70 px-1 text-[11px] font-semibold text-ink">{statusLabel(s.c.status)}</span>}
                  <span className="sr-only">{s.c1 - s.c0 >= 1 ? "" : `, ${statusLabel(s.c.status)}`}, {periodText(s.c)}</span>
                </Link>
              ))}
              {week.map((d, i) => {
                const evs = byDay.get(d) ?? [];
                const hidden = hiddenPerDay[i];
                if (!evs.length && !hidden) return null;
                return (
                  <ul key={`e-${d}`} style={{ gridColumn: i + 1, gridRow: 2 + lanes }} className="relative z-10 flex min-w-0 flex-col gap-1 px-1 pb-1.5 pt-1">
                    {evs.slice(0, 3).map((e) => <li key={e.id} className="min-w-0"><EventChip ev={e} compact onClick={() => onOpenEvent(e)} /></li>)}
                    {(evs.length > 3 || hidden > 0) && (
                      <li><button type="button" onClick={() => onOpenDay(d)} className="w-full rounded-md px-1.5 py-0.5 text-left text-xs font-semibold text-brand-strong underline-offset-2 hover:underline">
                        + {[evs.length > 3 && `${evs.length - 3} ${evs.length - 3 === 1 ? "data" : "datas"}`, hidden > 0 && `${hidden} ${hidden === 1 ? "campanha" : "campanhas"}`].filter(Boolean).join(" e ")}
                      </button></li>
                    )}
                  </ul>
                );
              })}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
