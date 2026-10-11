import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull, like } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { newId } from "@/server/ids";
import { createCampaign } from "@/server/services/campaigns";
import {
  createCalendarEvent, deleteCalendarEvent, ensureGlobalCalendar, getCalendar, isValidYmd, listCalendarEvents, resolveRange, updateCalendarEvent,
} from "@/server/services/calendar-events";
import { listCalendar } from "@/server/services/org";
import * as listRoute from "@/app/api/calendar/route";
import * as itemRoute from "@/app/api/calendar/[id]/route";
import { addMember, call, makeOrg, req, type TestOrg } from "./helpers";

let A: TestOrg, B: TestOrg;
const globalsOf = (year: number) => getDb().select().from(schema.calendarEvents)
  .where(and(isNull(schema.calendarEvents.orgId), like(schema.calendarEvents.date, `${year}-%`)));

describe("calendário de campanhas", () => {
  beforeAll(async () => {
    A = await makeOrg(); B = await makeOrg();
  });

  describe("datas comerciais globais por ano", () => {
    it("gera as datas móveis corretas para o ano consultado", async () => {
      const ev = await listCalendarEvents(A.ctx, "2026-01-01", "2026-12-31");
      const date = (n: string) => ev.find((e) => e.name === n && e.scope === "global")?.date;
      expect(date("Páscoa")).toBe("2026-04-05");
      expect(date("Carnaval")).toBe("2026-02-17");
      expect(date("Sexta-feira Santa")).toBe("2026-04-03");
      expect(date("Corpus Christi")).toBe("2026-06-04");
      expect(date("Dia das Mães")).toBe("2026-05-10");
      expect(date("Dia dos Pais")).toBe("2026-08-09");
      expect(date("Black Friday")).toBe("2026-11-27");
      expect(ev.find((e) => e.name === "Páscoa")!.isMovable).toBe(true);
      expect(ev.find((e) => e.name === "Natal")!.isMovable).toBe(false);
      expect(ev.every((e) => e.scope === "global" ? e.editable === false : true)).toBe(true);
    });

    it("cobre qualquer ano (2027 e 2031) e todos os anos de um intervalo que cruza a virada", async () => {
      const e27 = await listCalendarEvents(A.ctx, "2027-03-01", "2027-03-31");
      expect(e27.find((e) => e.name === "Páscoa")?.date).toBe("2027-03-28");
      expect(e27.find((e) => e.name === "Sexta-feira Santa")?.date).toBe("2027-03-26");
      const e31 = await listCalendarEvents(A.ctx, "2031-01-01", "2031-12-31");
      expect(e31.find((e) => e.name === "Páscoa")?.date).toBe("2031-04-13");
      expect(e31.find((e) => e.name === "Carnaval")?.date).toBe("2031-02-25");
      const cross = await listCalendarEvents(A.ctx, "2032-12-20", "2033-01-10");
      expect(cross.map((e) => e.date)).toEqual(expect.arrayContaining(["2032-12-25", "2033-01-01"]));
      expect((await globalsOf(2033)).length).toBeGreaterThanOrEqual(16);
    });

    it("é idempotente: chamadas repetidas e simultâneas não duplicam", async () => {
      await Promise.all([ensureGlobalCalendar([2040]), ensureGlobalCalendar([2040]), listCalendarEvents(A.ctx, "2040-01-01", "2040-12-31")]);
      const first = await globalsOf(2040);
      expect(await ensureGlobalCalendar([2040])).toEqual({ inserted: 0, fixed: 0 });
      const again = await globalsOf(2040);
      expect(again.length).toBe(first.length);
      expect(new Set(again.map((e) => e.name)).size).toBe(again.length);
    });

    it("corrige data móvel errada e remove duplicata do calendário padrão", async () => {
      await ensureGlobalCalendar([2041]);
      const [pascoa] = (await globalsOf(2041)).filter((e) => e.name === "Páscoa");
      await getDb().update(schema.calendarEvents).set({ date: "2041-04-01" }).where(eq(schema.calendarEvents.id, pascoa.id));
      await getDb().insert(schema.calendarEvents).values({ id: newId("cal"), orgId: null, name: "Natal", date: "2041-12-25", isMovable: false });
      const r = await ensureGlobalCalendar([2041]);
      expect(r.fixed).toBe(2);
      const rows = await globalsOf(2041);
      expect(rows.find((e) => e.name === "Páscoa")!.date).toBe("2041-04-21");
      expect(rows.filter((e) => e.name === "Natal")).toHaveLength(1);
    });

    it("valida o intervalo consultado", () => {
      expect(() => resolveRange("2026-02-30", "2026-03-01")).toThrow(/inicial inválida/);
      expect(() => resolveRange("2026-03-10", "2026-03-01")).toThrow(/posterior/);
      expect(() => resolveRange("2026-01-01", "2030-01-01")).toThrow(/longo demais/);
      expect(resolveRange("2026-02-01", null)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
      expect(isValidYmd("2028-02-29")).toBe(true);
      expect(isValidYmd("2027-02-29")).toBe(false);
    });

    it("org.ts continua exportando listCalendar", async () => {
      const ev = await listCalendar(A.ctx, "2026-10-01", "2026-10-31");
      expect(ev.map((e) => e.name)).toContain("Dia das Crianças");
    });
  });

  describe("eventos da conta (CRUD)", () => {
    it("cria, edita e exclui, registrando no histórico", async () => {
      const ev = await createCalendarEvent(A.ctx, { name: "  Aniversário da loja  ", date: "2026-11-03", note: "Bolo e café" });
      expect(ev).toMatchObject({ name: "Aniversário da loja", date: "2026-11-03", scope: "conta", editable: true, isMovable: false, note: "Bolo e café" });
      const list = await listCalendarEvents(A.ctx, "2026-11-01", "2026-11-30");
      expect(list.find((e) => e.id === ev.id)).toBeTruthy();

      const up = await updateCalendarEvent(A.ctx, ev.id, { date: "2026-11-04" });
      expect(up).toMatchObject({ name: "Aniversário da loja", date: "2026-11-04", note: "Bolo e café" }); // nota mantida
      const cleared = await updateCalendarEvent(A.ctx, ev.id, { note: "" });
      expect(cleared.note).toBeNull();

      await deleteCalendarEvent(A.ctx, ev.id);
      expect((await listCalendarEvents(A.ctx, "2026-11-01", "2026-11-30")).find((e) => e.id === ev.id)).toBeUndefined();

      const audit = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, A.orgId), eq(schema.auditLog.entityId, ev.id)));
      expect(audit.map((a) => a.action).sort()).toEqual(["calendar.create", "calendar.delete", "calendar.update", "calendar.update"]);
    });

    it("valida nome, data e observação", async () => {
      await expect(createCalendarEvent(A.ctx, { name: "", date: "2026-11-03" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(createCalendarEvent(A.ctx, { name: "x".repeat(81), date: "2026-11-03" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(createCalendarEvent(A.ctx, { name: "Ok", date: "2026-02-30" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(createCalendarEvent(A.ctx, { name: "Ok", date: "03/11/2026" })).rejects.toMatchObject({ name: "ZodError" });
      await expect(createCalendarEvent(A.ctx, { name: "Ok", date: "2026-11-03", note: "n".repeat(201) })).rejects.toMatchObject({ name: "ZodError" });
      const r = await call(listRoute.POST, req("POST", "/api/calendar", { token: A.token, body: { name: "", date: "x" } }));
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe("validation");
    });

    it("datas do calendário padrão são somente leitura, com mensagem clara", async () => {
      const g = (await listCalendarEvents(A.ctx, "2026-04-01", "2026-04-30")).find((e) => e.scope === "global")!;
      await expect(updateCalendarEvent(A.ctx, g.id, { name: "Hack" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(deleteCalendarEvent(A.ctx, g.id)).rejects.toMatchObject({ code: "forbidden" });
      const r = await call(itemRoute.DELETE, req("DELETE", `/api/calendar/${g.id}`, { token: A.token }), { id: g.id });
      expect(r.status).toBe(403);
      expect(r.json.error.message).toMatch(/calendário padrão/);
    });

    it("aprovador só lê; editor pode escrever", async () => {
      const aprov = await addMember(A, "aprovador");
      const editor = await addMember(A, "editor");
      await expect(createCalendarEvent(aprov.ctx, { name: "X", date: "2026-11-05" })).rejects.toMatchObject({ code: "forbidden" });
      const r = await call(listRoute.POST, req("POST", "/api/calendar", { token: aprov.token, body: { name: "X", date: "2026-11-05" } }));
      expect(r.status).toBe(403);
      const ev = await createCalendarEvent(editor.ctx, { name: "Feira de vinhos", date: "2026-11-06" });
      await expect(updateCalendarEvent(aprov.ctx, ev.id, { name: "Y" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(deleteCalendarEvent(aprov.ctx, ev.id)).rejects.toMatchObject({ code: "forbidden" });
      const seen = await call(listRoute.GET, req("GET", "/api/calendar?from=2026-11-01&to=2026-11-30", { token: aprov.token }));
      expect(seen.status).toBe(200);
      expect(seen.json.canEdit).toBe(false);
      const mine = seen.json.events.find((e: { id: string }) => e.id === ev.id);
      expect(mine).toMatchObject({ scope: "conta", editable: false });
    });
  });

  describe("rotas HTTP e isolamento entre contas", () => {
    let bEventId: string;
    let bCampaignId: string;
    beforeAll(async () => {
      bEventId = (await createCalendarEvent(B.ctx, { name: "Evento secreto B", date: "2026-12-05" })).id;
      bCampaignId = (await createCampaign(B.ctx, { storeId: B.storeId, name: "Campanha secreta B", startsAt: "2026-12-01T03:00:00.000Z", endsAt: "2026-12-08T02:59:00.000Z" })).campaign.id;
    });

    it("GET devolve eventos e campanhas da própria conta no período", async () => {
      const aCamp = (await createCampaign(A.ctx, { storeId: A.storeId, name: "Natal A", startsAt: "2026-11-28T03:00:00.000Z", endsAt: "2026-12-03T02:59:00.000Z" })).campaign.id;
      await createCampaign(A.ctx, { storeId: A.storeId, name: "Fora do período", startsAt: "2027-02-01T03:00:00.000Z", endsAt: "2027-02-05T02:59:00.000Z" });
      const r = await call(listRoute.GET, req("GET", "/api/calendar?from=2026-12-01&to=2026-12-31", { token: A.token }));
      expect(r.status).toBe(200);
      expect(r.json.range).toEqual({ from: "2026-12-01", to: "2026-12-31" });
      const camp = r.json.campaigns.find((c: { id: string }) => c.id === aCamp);
      expect(camp).toMatchObject({ name: "Natal A", status: "rascunho", storeId: A.storeId });
      expect(camp.storeName).toBeTruthy();
      expect(r.json.campaigns.map((c: { name: string }) => c.name)).not.toContain("Fora do período");
      expect(r.json.events.map((e: { name: string }) => e.name)).toContain("Natal");
      expect(JSON.stringify(r.json)).not.toMatch(/cost/i);
    });

    it("conta A não vê eventos nem campanhas da conta B", async () => {
      const cal = await getCalendar(A.ctx, "2026-12-01", "2026-12-31");
      expect(cal.events.map((e) => e.id)).not.toContain(bEventId);
      expect(cal.campaigns.map((c) => c.id)).not.toContain(bCampaignId);
      const r = await call(listRoute.GET, req("GET", "/api/calendar?from=2026-12-01&to=2026-12-31", { token: A.token }));
      expect(JSON.stringify(r.json)).not.toMatch(/secret[oa] B/);
      // B enxerga os seus
      const own = await getCalendar(B.ctx, "2026-12-01", "2026-12-31");
      expect(own.events.map((e) => e.id)).toContain(bEventId);
      expect(own.campaigns.map((c) => c.id)).toContain(bCampaignId);
    });

    it("conta A não edita nem exclui evento da conta B (404)", async () => {
      await expect(updateCalendarEvent(A.ctx, bEventId, { name: "Hack" })).rejects.toMatchObject({ code: "not_found" });
      await expect(deleteCalendarEvent(A.ctx, bEventId)).rejects.toMatchObject({ code: "not_found" });
      expect((await call(itemRoute.PATCH, req("PATCH", `/api/calendar/${bEventId}`, { token: A.token, body: { name: "Hack" } }), { id: bEventId })).status).toBe(404);
      expect((await call(itemRoute.DELETE, req("DELETE", `/api/calendar/${bEventId}`, { token: A.token }), { id: bEventId })).status).toBe(404);
      const [row] = await getDb().select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, bEventId));
      expect(row.name).toBe("Evento secreto B");
    });

    it("orgId no corpo é ignorado: evento criado sempre na conta da sessão", async () => {
      const r = await call(listRoute.POST, req("POST", "/api/calendar", { token: A.token, body: { name: "Meu evento", date: "2026-12-10", orgId: B.orgId } }));
      expect(r.status).toBe(201);
      const [row] = await getDb().select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, r.json.id));
      expect(row.orgId).toBe(A.orgId);
      const p = await call(itemRoute.PATCH, req("PATCH", `/api/calendar/${r.json.id}`, { token: A.token, body: { name: "Renomeado" } }), { id: r.json.id });
      expect(p.status).toBe(200);
      expect(p.json.name).toBe("Renomeado");
      expect((await call(itemRoute.DELETE, req("DELETE", `/api/calendar/${r.json.id}`, { token: A.token }), { id: r.json.id })).status).toBe(200);
    });

    it("sem sessão: 401", async () => {
      expect((await call(listRoute.GET, req("GET", "/api/calendar"))).status).toBe(401);
    });
  });
});
