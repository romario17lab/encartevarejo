// Agendamento da programação da TV — módulo PURO (sem dependências de servidor):
// usado pela API (o que toca agora) e pelo player no aparelho (avaliação local, inclusive offline).
// Fuso: America/Sao_Paulo (sem horário de verão desde 2019: UTC−3 fixo nas conversões de data).

export const TV_TZ = "America/Sao_Paulo";

export interface ScheduleRule {
  /** ISO; início inclusivo. null = sem início */
  startsAt: string | null;
  /** ISO; fim exclusivo. null = sem fim */
  endsAt: string | null;
  /** 0=domingo..6; null/vazio = todos os dias */
  daysOfWeek: number[] | null;
  /** "08:00-12:00" ou "08:00-12:00,14:00-18:00"; faixa que vira a meia-noite ("22:00-02:00") vale até o fim dela; null = o dia todo */
  hours: string | null;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let fmt: Intl.DateTimeFormat | null = null;

/** Dia da semana, minutos desde a meia-noite e data (AAAA-MM-DD) no horário de Brasília. */
export function spClock(now: Date): { dow: number; minutes: number; ymd: string } {
  fmt ??= new Intl.DateTimeFormat("en-US", { timeZone: TV_TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return { dow: DOW[parts.weekday!] ?? 0, minutes: hour * 60 + Number(parts.minute), ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

const HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-4]):([0-5]\d)$/;

/** Faixas de horário em minutos; null se o texto for inválido. */
export function parseHours(hours: string): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const part of hours.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = HOURS_RE.exec(part);
    if (!m) return null;
    const a = Number(m[1]) * 60 + Number(m[2]);
    const b = Math.min(1440, Number(m[3]) * 60 + Number(m[4]));
    if (a === b) return null;
    out.push([a, b]);
  }
  return out.length ? out : null;
}

export function isValidHours(hours: string): boolean { return parseHours(hours) !== null; }

function inHours(ranges: Array<[number, number]>, minutes: number, dow: number, days: Set<number> | null): boolean {
  for (const [a, b] of ranges) {
    if (a < b) { if (minutes >= a && minutes < b && (!days || days.has(dow))) return true; }
    else {
      // faixa que vira a meia-noite: a parte da madrugada pertence ao dia anterior
      if (minutes >= a && (!days || days.has(dow))) return true;
      if (minutes < b && (!days || days.has((dow + 6) % 7))) return true;
    }
  }
  return false;
}

/** A regra vale neste instante? */
export function isScheduleActive(rule: ScheduleRule, now: Date): boolean {
  const t = now.getTime();
  if (rule.startsAt && t < Date.parse(rule.startsAt)) return false;
  if (rule.endsAt && t >= Date.parse(rule.endsAt)) return false;
  const days = rule.daysOfWeek && rule.daysOfWeek.length ? new Set(rule.daysOfWeek) : null;
  const { dow, minutes } = spClock(now);
  if (rule.hours) {
    const ranges = parseHours(rule.hours);
    if (!ranges) return false;
    return inHours(ranges, minutes, dow, days);
  }
  return !days || days.has(dow);
}

/** "2026-10-12" (data local de Brasília) → instante da meia-noite em Brasília. */
export function spDateStart(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("data inválida");
  const d = new Date(`${ymd}T00:00:00-03:00`);
  if (Number.isNaN(d.getTime())) throw new Error("data inválida");
  return d;
}
/** Fim exclusivo do dia (meia-noite seguinte em Brasília). */
export function spDateEnd(ymd: string): Date { return new Date(spDateStart(ymd).getTime() + 86400_000); }
/** Instante → "AAAA-MM-DD" em Brasília. */
export function spYmd(d: Date): string { return spClock(d).ymd; }
