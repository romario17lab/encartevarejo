// Formatação de datas e textos para a interface (pt-BR, fuso local do navegador).
import { formatBRL } from "@/domain/money";
import { UNITS, type Unit } from "@/domain/offer";

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  const v = toDateInput(iso);
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return opts.year === false ? `${d}/${m}` : `${d}/${m}/${y}`;
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(iso)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtTime(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// Datas de campanha seguem o horário de Brasília (sem horário de verão desde 2019), igual ao servidor.
/** ISO → valor de <input type="date"> (data em São Paulo) */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** <input type="date"> → ISO. endOfDay = 23:59 (fim da validade), horário de Brasília. */
export function fromDateInput(v: string, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T${endOfDay ? "23:59:00" : "00:00:00"}-03:00`).toISOString();
}

// Mesma regra de src/server/services/render-data.ts (buildValidityText), fuso de São Paulo.
const TZ = "America/Sao_Paulo";
const dmyTZ = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const dmTZ = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
const yTZ = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric" }).format(d);
export function validityText(startsAtIso: string | null, endsAtIso: string | null, note: string | null): string {
  const startsAt = startsAtIso ? new Date(startsAtIso) : null;
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  let base = "";
  if (startsAt && endsAt) {
    if (dmyTZ(startsAt) === dmyTZ(endsAt)) base = `Oferta válida somente em ${dmyTZ(startsAt)}`;
    else if (yTZ(startsAt) === yTZ(endsAt)) base = `Ofertas válidas de ${dmTZ(startsAt)} a ${dmyTZ(endsAt)}`;
    else base = `Ofertas válidas de ${dmyTZ(startsAt)} a ${dmyTZ(endsAt)}`;
  } else if (startsAt) base = `Ofertas válidas a partir de ${dmyTZ(startsAt)}`;
  else if (endsAt) base = `Ofertas válidas até ${dmyTZ(endsAt)}`;
  const n = note?.trim();
  if (!n) return base;
  if (!base) return n.charAt(0).toUpperCase() + n.slice(1);
  return `${base} ${n}`;
}

export const money = (c: number | null | undefined) => (c == null ? "—" : formatBRL(c));
export const unitShort = (u: Unit | null | undefined) => (u && UNITS[u] ? UNITS[u].short : "");
export const UNIT_OPTIONS = [{ value: "", label: "Selecione…" }, ...Object.entries(UNITS).map(([k, v]) => ({ value: k, label: `${v.short} — ${v.label}` }))];

export function pctChange(oldC: number | null | undefined, newC: number | null | undefined): number | null {
  if (oldC == null || newC == null || oldC === 0) return null;
  return Math.round(((newC - oldC) * 1000) / oldC) / 10;
}
export const fmtPct = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1).replace(".", ",")}%`);
export const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

export const SEGMENTS: Array<{ value: string; label: string }> = [
  { value: "supermercado", label: "Supermercado" },
  { value: "hortifruti", label: "Hortifrúti" },
  { value: "acougue", label: "Açougue" },
  { value: "padaria", label: "Padaria" },
  { value: "bebidas", label: "Bebidas / adega" },
  { value: "varejo", label: "Outro varejo" },
];
export const STYLE_LABEL: Record<string, string> = { popular: "Popular", moderno: "Moderno", elegante: "Elegante", economico: "Econômico" };
export const SEGMENT_LABEL: Record<string, string> = Object.fromEntries([...SEGMENTS, { value: "sazonal", label: "Datas comemorativas" }].map((s) => [s.value, s.label]));
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
