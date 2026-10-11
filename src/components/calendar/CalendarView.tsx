"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ErrorState, Spinner, toast } from "@/components/ui";
import { LoadingBlock, PageHeader } from "@/components/app/common";
import { IconPlus } from "@/components/app/icons";
import { qs } from "@/lib/client/api";
import { useApi, useMe } from "@/lib/client/hooks";
import { AgendaList } from "./AgendaList";
import { DayDialog } from "./DayDialog";
import { EventDialog } from "./EventDialog";
import { MonthGrid } from "./MonthGrid";
import { campaignDays, monthBounds, monthGrid, monthLabel, monthOf, newCampaignHref, addDaysYmd, shiftMonth, todayYmd } from "./dates";
import { IconCalendar, IconChevronLeft, IconChevronRight, Legend, type CalendarData, type CalEvent, type PlacedCampaign } from "./shared";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
type EventState = { open: boolean; event: CalEvent | null; date?: string };

export function CalendarView({ initialMonth }: { initialMonth: string | null }) {
  const { can, storeId } = useMe();
  const [today, setToday] = useState(() => todayYmd());
  const [month, setMonth] = useState(() => initialMonth ?? monthOf(todayYmd()));
  const [day, setDay] = useState<string | null>(null);
  const [evState, setEvState] = useState<EventState>({ open: false, event: null });

  // "hoje" atualiza se a página ficar aberta na virada do dia
  useEffect(() => { const t = setInterval(() => setToday(todayYmd()), 60_000); return () => clearInterval(t); }, []);
  // mês na URL (?mes=AAAA-MM) para compartilhar/voltar, sem recarregar a página
  useEffect(() => {
    try { const u = new URL(window.location.href); u.searchParams.set("mes", month); window.history.replaceState(window.history.state, "", u); } catch { /* ignora */ }
  }, [month]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const from = weeks[0][0], to = weeks[weeks.length - 1][6];
  const q = useApi<CalendarData>(`/api/calendar${qs({ from, to })}`, [from, to]);
  const data = q.data && q.data.range.from === from && q.data.range.to === to ? q.data : undefined;
  const stale = !data && !!q.data; // trocando de mês: mantém a grade anterior visível

  const shown = data ?? q.data;
  const campaigns = useMemo<PlacedCampaign[]>(() => (shown?.campaigns ?? [])
    .filter((c) => !storeId || c.storeId === storeId)
    .flatMap((c) => { const p = campaignDays(c); return p ? [{ ...c, ...p }] : []; }), [shown, storeId]);
  const events = shown?.events ?? [];
  const canEdit = (shown?.canEdit ?? can("campaigns.write"));
  const canCreateCampaign = can("campaigns.write");

  const { first, last } = monthBounds(month);
  const monthEvents = events.filter((e) => e.date >= first && e.date <= last);
  const monthCampaigns = campaigns.filter((c) => c.start <= last && c.end >= first);
  const counts = [
    plural(monthCampaigns.length, "campanha", "campanhas"),
    plural(monthEvents.filter((e) => e.scope === "global").length, "data comercial", "datas comerciais"),
    plural(monthEvents.filter((e) => e.scope === "conta").length, "evento da conta", "eventos da conta"),
  ].join(" · ");

  const closeDay = useCallback(() => setDay(null), []);
  const closeEvent = useCallback(() => setEvState((s) => ({ ...s, open: false })), []);
  const openEvent = useCallback((e: CalEvent) => { setDay(null); setEvState({ open: true, event: e }); }, []);
  const addEvent = useCallback((date?: string) => { setDay(null); setEvState({ open: true, event: null, date }); }, []);
  const reload = q.reload;
  const onSaved = useCallback((msg: string) => { toast(msg, "success"); void reload(); }, [reload]);

  const go = (n: number) => setMonth((m) => shiftMonth(m, n));
  const isCurrent = month === monthOf(today);
  const startForNew = first > today ? first : today; // nunca sugere começar no passado

  return (
    <>
      <PageHeader title="Calendário"
        description="Suas campanhas, as datas comerciais do varejo e os eventos da sua equipe."
        actions={<div className="flex flex-wrap gap-2 sm:flex-nowrap">
          {canEdit && <Button variant="secondary" className="whitespace-nowrap" icon={<IconPlus size={18} />} onClick={() => addEvent(startForNew)}>Novo evento</Button>}
          {canCreateCampaign && (
            <Link href={newCampaignHref(startForNew, addDaysYmd(startForNew, 6))} className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong">
              <IconPlus size={18} />Criar campanha
            </Link>
          )}
        </div>} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="order-1 w-full min-w-0 font-display text-xl font-bold first-letter:uppercase sm:order-2 sm:w-auto sm:flex-1 sm:text-2xl" aria-live="polite">{monthLabel(month)}</h2>
        <div className="order-2 flex items-center gap-1 sm:order-1">
          <Button variant="secondary" aria-label="Mês anterior" className="w-11 !px-0" onClick={() => go(-1)}><IconChevronLeft size={24} strokeWidth={2.5} /></Button>
          <Button variant="secondary" aria-label="Próximo mês" className="w-11 !px-0" onClick={() => go(1)}><IconChevronRight size={24} strokeWidth={2.5} /></Button>
        </div>
        {(q.loading && q.data) && <span className="order-3"><Spinner size={18} label="Atualizando" /></span>}
        <Button variant="secondary" className="order-4 ml-auto" icon={<IconCalendar size={18} />} onClick={() => setMonth(monthOf(today))} disabled={isCurrent}
          aria-label={isCurrent ? "Hoje (você já está no mês atual)" : "Hoje: voltar para o mês atual"}>Hoje</Button>
      </div>
      <p className="mb-3 text-sm text-ink-muted">{shown ? counts : " "}</p>
      <Legend className="mb-4" />

      {!shown && q.loading ? <LoadingBlock label="Carregando calendário…" />
        : q.error && !data ? <ErrorState title="Não foi possível carregar o calendário" message={q.error.message} onRetry={q.reload} />
          : (
            <div className={stale ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={q.loading || undefined}>
              <div className="hidden lg:block">
                <MonthGrid month={month} weeks={weeks} events={events} campaigns={campaigns} today={today} onOpenDay={setDay} onOpenEvent={openEvent} />
              </div>
              <div className="lg:hidden">
                {monthEvents.length === 0 && monthCampaigns.length === 0 && !stale ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
                    <p className="font-display text-lg font-bold">Nada neste mês</p>
                    <p className="max-w-sm text-sm text-ink-muted">Nenhuma campanha, data comercial ou evento da conta em {monthLabel(month)}.</p>
                    {canEdit && <Button variant="secondary" icon={<IconPlus size={18} />} onClick={() => addEvent(startForNew)}>Adicionar evento</Button>}
                  </div>
                ) : (
                  <AgendaList month={month} weeks={weeks} events={events} campaigns={campaigns} today={today} onOpenDay={setDay} onOpenEvent={openEvent} />
                )}
              </div>
              {data && monthCampaigns.length === 0 && (
                <p className="mt-3 hidden text-sm text-ink-muted lg:block">Nenhuma campanha com período neste mês.{canCreateCampaign ? " Clique em um dia para criar uma a partir dele." : ""}</p>
              )}
            </div>
          )}

      <DayDialog day={day} onClose={closeDay} events={events} campaigns={campaigns} today={today} canEdit={canEdit} canCreateCampaign={canCreateCampaign}
        onOpenEvent={openEvent} onAddEvent={addEvent} />
      <EventDialog open={evState.open} onClose={closeEvent} event={evState.event} defaultDate={evState.date} today={today}
        canEdit={canEdit} canCreateCampaign={canCreateCampaign} onSaved={onSaved} />
    </>
  );
}
