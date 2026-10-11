import { describe, expect, it } from "vitest";
import { commercialCalendar, easterSunday, ymd } from "@/server/calendar";

const get = (y: number, name: string) => commercialCalendar(y).find((e) => e.name === name)!.date;

describe("calendário comercial", () => {
  it("Páscoa pelo algoritmo gregoriano anônimo", () => {
    expect(ymd(easterSunday(2026))).toBe("2026-04-05");
    expect(ymd(easterSunday(2027))).toBe("2027-03-28");
    expect(ymd(easterSunday(2024))).toBe("2024-03-31");
    expect(ymd(easterSunday(2025))).toBe("2025-04-20");
  });
  it("datas móveis de 2026", () => {
    expect(get(2026, "Carnaval")).toBe("2026-02-17");
    expect(get(2026, "Sexta-feira Santa")).toBe("2026-04-03");
    expect(get(2026, "Corpus Christi")).toBe("2026-06-04");
    expect(get(2026, "Dia das Mães")).toBe("2026-05-10");
    expect(get(2026, "Dia dos Pais")).toBe("2026-08-09");
    expect(get(2026, "Black Friday")).toBe("2026-11-27");
  });
  it("datas móveis de 2027", () => {
    expect(get(2027, "Carnaval")).toBe("2027-02-09");
    expect(get(2027, "Sexta-feira Santa")).toBe("2027-03-26");
    expect(get(2027, "Corpus Christi")).toBe("2027-05-27");
    expect(get(2027, "Dia das Mães")).toBe("2027-05-09");
    expect(get(2027, "Dia dos Pais")).toBe("2027-08-08");
    expect(get(2027, "Black Friday")).toBe("2027-11-26");
  });
  it("datas fixas", () => {
    expect(get(2026, "Dia do Consumidor")).toBe("2026-03-15");
    expect(get(2026, "Dia das Crianças")).toBe("2026-10-12");
    expect(get(2026, "Dia do Cliente")).toBe("2026-09-15");
    expect(get(2027, "Natal")).toBe("2027-12-25");
    expect(get(2027, "Festa Junina")).toBe("2027-06-01");
  });
});
