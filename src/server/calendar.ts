// Calendário comercial brasileiro com datas móveis calculadas (sem tabela fixa por ano).

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

/** Domingo de Páscoa — algoritmo gregoriano anônimo (Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** n-ésimo dia da semana (0=domingo) do mês. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

export interface CommercialDate { name: string; date: string; isMovable: boolean; note: string | null }

export function commercialCalendar(year: number): CommercialDate[] {
  const easter = easterSunday(year);
  const thanksgiving = nthWeekday(year, 11, 4, 4); // 4ª quinta-feira de novembro
  const list: CommercialDate[] = [
    { name: "Ano Novo", date: `${year}-01-01`, isMovable: false, note: null },
    { name: "Carnaval", date: ymd(addDays(easter, -47)), isMovable: true, note: "Terça-feira de Carnaval" },
    { name: "Dia do Consumidor", date: `${year}-03-15`, isMovable: false, note: null },
    { name: "Sexta-feira Santa", date: ymd(addDays(easter, -2)), isMovable: true, note: "Semana Santa: peixes, bacalhau, azeite" },
    { name: "Páscoa", date: ymd(easter), isMovable: true, note: "Chocolates e ovos de Páscoa" },
    { name: "Dia das Mães", date: ymd(nthWeekday(year, 5, 0, 2)), isMovable: true, note: "2º domingo de maio" },
    { name: "Festa Junina", date: `${year}-06-01`, isMovable: false, note: "Início da temporada de festas juninas" },
    { name: "Dia dos Namorados", date: `${year}-06-12`, isMovable: false, note: null },
    { name: "Corpus Christi", date: ymd(addDays(easter, 60)), isMovable: true, note: "Feriado prolongado em muitas cidades" },
    { name: "Dia dos Pais", date: ymd(nthWeekday(year, 8, 0, 2)), isMovable: true, note: "2º domingo de agosto" },
    { name: "Dia do Cliente", date: `${year}-09-15`, isMovable: false, note: null },
    { name: "Dia das Crianças", date: `${year}-10-12`, isMovable: false, note: null },
    { name: "Black Friday", date: ymd(addDays(thanksgiving, 1)), isMovable: true, note: "Sexta-feira após a 4ª quinta-feira de novembro" },
    { name: "Véspera de Natal", date: `${year}-12-24`, isMovable: false, note: null },
    { name: "Natal", date: `${year}-12-25`, isMovable: false, note: null },
    { name: "Véspera de Ano Novo", date: `${year}-12-31`, isMovable: false, note: null },
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
