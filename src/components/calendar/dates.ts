// Datas do calendário como strings AAAA-MM-DD (dia civil em São Paulo), sem depender do fuso do navegador.
import { toDateInput } from "@/lib/client/format";

const pad = (n: number) => String(n).padStart(2, "0");
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAYS_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const toUtc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const addDaysYmd = (ymd: string, n: number) => fromUtc(new Date(toUtc(ymd).getTime() + n * 86400000));
export const weekday = (ymd: string) => toUtc(ymd).getUTCDay();
export const todayYmd = () => toDateInput(new Date().toISOString());
export const monthOf = (ymd: string) => ymd.slice(0, 7);
export const isMonthKey = (v: string | null | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && Number(v.slice(0, 4)) >= 2000 && Number(v.slice(0, 4)) <= 2100;

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  return { first, last };
}
/** Grade do mês: semanas completas (domingo a sábado). */
export function monthGrid(month: string): string[][] {
  const { first, last } = monthBounds(month);
  const start = addDaysYmd(first, -weekday(first));
  const end = addDaysYmd(last, 6 - weekday(last));
  const weeks: string[][] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysYmd(d, i)));
  return weeks;
}
export const monthLabel = (month: string) => { const [y, m] = month.split("-").map(Number); return `${MONTHS[m - 1]} de ${y}`; };
export const dayNum = (ymd: string) => Number(ymd.slice(8, 10));
/** "12 de out." */
export const shortDate = (ymd: string) => `${dayNum(ymd)} ${MONTHS_SHORT[Number(ymd.slice(5, 7)) - 1]}`;
/** "segunda-feira, 12 de outubro de 2026" */
export const longDate = (ymd: string) => `${WEEKDAYS_LONG[weekday(ymd)]}, ${dayNum(ymd)} de ${MONTHS[Number(ymd.slice(5, 7)) - 1]} de ${ymd.slice(0, 4)}`;
/** "12/10" */
export const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Período (inclusive) de uma campanha em dias de São Paulo. Sem uma das datas, usa a outra. */
export function campaignDays(c: { startsAt: string | null; endsAt: string | null }): { start: string; end: string } | null {
  const s = toDateInput(c.startsAt) || toDateInput(c.endsAt);
  const e = toDateInput(c.endsAt) || s;
  if (!s || !e) return null;
  return e < s ? { start: e, end: s } : { start: s, end: e };
}

/** Link para criar campanha com período pré-preenchido. */
export const newCampaignHref = (inicio: string, fim: string) => `/app/campanhas/nova?inicio=${inicio}&fim=${fim}`;

/**
 * Período sugerido para uma data comercial: a semana que antecede a data (inclusive),
 * sem começar no passado.
 */
export function suggestedPeriodFor(date: string, today: string): { inicio: string; fim: string } {
  const inicio = addDaysYmd(date, -6) < today ? today : addDaysYmd(date, -6);
  return { inicio: inicio > date ? date : inicio, fim: date };
}
