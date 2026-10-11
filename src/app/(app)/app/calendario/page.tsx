import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/CalendarView";
import { isMonthKey } from "@/components/calendar/dates";

export const metadata: Metadata = { title: "Calendário" };

/** /app/calendario?mes=AAAA-MM */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const mes = typeof sp.mes === "string" && isMonthKey(sp.mes) ? sp.mes : null;
  return <CalendarView initialMonth={mes} />;
}
