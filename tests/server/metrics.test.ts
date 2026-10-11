// Etapa 3: métricas (agregação no banco, período, origem, campanha, exportações, isolamento) e link de campanha na vitrine.
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getMetrics } from "@/server/services/metrics";
import { createCampaign } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { normalizeSource } from "@/server/services/storefront";
import { newId } from "@/server/ids";
import { normalizeOrigin, storefrontLink } from "@/components/campaign/origins";
import LojaPage from "@/app/loja/[slug]/page";
import * as metricsRoute from "@/app/api/metrics/route";
import { addMember, call, days, makeOrg, makeProduct, req, templateId, type TestOrg } from "./helpers";

// "agora" fixo: 11/10/2026 12:00 em São Paulo (15:00 UTC)
const NOW = new Date("2026-10-11T15:00:00Z");
type Kind = "view" | "whatsapp_click" | "share" | "qr_scan";

async function ev(org: TestOrg, kind: Kind, at: string, opts: { source?: string | null; campaignId?: string | null; storeId?: string } = {}) {
  await getDb().insert(schema.storefrontEvents).values({
    orgId: org.orgId, storeId: opts.storeId ?? org.storeId, campaignId: opts.campaignId ?? null, kind, source: opts.source ?? null, createdAt: new Date(at),
  });
}

async function campaign(org: TestOrg, name: string, storeId = org.storeId) {
  const st = await createCampaign(org.ctx, { storeId, name, templateId: templateId(), startsAt: days(-1, NOW).toISOString(), endsAt: days(5, NOW).toISOString() });
  return st.campaign.id;
}

async function secondStore(org: TestOrg) {
  const [first] = await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId));
  const id = newId("sto");
  await getDb().insert(schema.stores).values({ id, orgId: org.orgId, brandKitId: first!.brandKitId, name: "Filial Centro", slug: `filial-${id.slice(-8).toLowerCase().replace(/[^a-z0-9]/g, "x")}` });
  return id;
}

describe("métricas: agregação", () => {
  it("soma visualizações, WhatsApp, compartilhamentos e QR por dia (fuso de São Paulo) e por origem", async () => {
    const org = await makeOrg();
    await ev(org, "view", "2026-10-11T13:00:00Z", { source: "qr" });
    await ev(org, "view", "2026-10-11T14:00:00Z", { source: "qr" });
    await ev(org, "view", "2026-10-11T14:30:00Z");
    // 23:30 de 10/10 em São Paulo (já é 11/10 em UTC)
    await ev(org, "whatsapp_click", "2026-10-11T02:30:00Z", { source: "whatsapp" });
    await ev(org, "whatsapp_click", "2026-10-09T12:00:00Z", { source: "whatsapp" });
    await ev(org, "share", "2026-10-09T12:00:00Z");
    await ev(org, "qr_scan", "2026-10-08T12:00:00Z");

    const m = await getMetrics(org.ctx, { periodo: "7" }, NOW);
    expect(m.period).toMatchObject({ days: 7, from: "2026-10-05", to: "2026-10-11", timezone: "America/Sao_Paulo" });
    expect(m.totals).toEqual({ views: 3, whatsappClicks: 2, shares: 1, qrAccesses: 3 });
    expect(m.series).toHaveLength(7);
    expect(m.series[0]!.date).toBe("2026-10-05");
    const day = (d: string) => m.series.find((s) => s.date === d)!;
    expect(day("2026-10-11")).toEqual({ date: "2026-10-11", views: 3, whatsappClicks: 0, shares: 0, qrAccesses: 2 });
    expect(day("2026-10-10")).toMatchObject({ whatsappClicks: 1 });
    expect(day("2026-10-09")).toMatchObject({ whatsappClicks: 1, shares: 1 });
    expect(day("2026-10-08")).toMatchObject({ qrAccesses: 1, views: 0 });
    // soma da série = total
    expect(m.series.reduce((n, s) => n + s.views, 0)).toBe(3);

    expect(m.byOrigin).toEqual([
      { source: "qr", views: 2, whatsappClicks: 0, shares: 0 },
      { source: null, views: 1, whatsappClicks: 0, shares: 1 },
      { source: "whatsapp", views: 0, whatsappClicks: 2, shares: 0 },
    ]);
  });

  it("filtra pelo período (7/30/90 dias) e rejeita período inválido", async () => {
    const org = await makeOrg();
    await ev(org, "view", "2026-10-11T12:00:00Z");
    await ev(org, "view", "2026-10-05T03:30:00Z"); // 05/10 00:30 em SP: dentro dos 7 dias
    await ev(org, "view", "2026-10-05T02:30:00Z"); // 04/10 23:30 em SP: fora dos 7 dias
    await ev(org, "view", "2026-09-20T12:00:00Z");
    await ev(org, "view", "2026-07-01T12:00:00Z");
    await ev(org, "view", "2026-10-11T16:00:00Z"); // depois de "agora": não conta
    expect((await getMetrics(org.ctx, { periodo: "7" }, NOW)).totals.views).toBe(2);
    const m30 = await getMetrics(org.ctx, { periodo: "30" }, NOW);
    expect(m30.totals.views).toBe(4);
    expect(m30.series).toHaveLength(30);
    expect((await getMetrics(org.ctx, { periodo: "90" }, NOW)).totals.views).toBe(4);
    expect((await getMetrics(org.ctx, {}, NOW)).period.days).toBe(30);
    await expect(getMetrics(org.ctx, { periodo: "15" }, NOW)).rejects.toThrow();
  });

  it("agrupa por campanha (nome) e mostra a vitrine geral à parte", async () => {
    const org = await makeOrg();
    const a = await campaign(org, "Semana do Arroz");
    const b = await campaign(org, "Feira de Sábado");
    await ev(org, "view", "2026-10-11T12:00:00Z", { campaignId: a });
    await ev(org, "view", "2026-10-11T12:00:00Z", { campaignId: a });
    await ev(org, "whatsapp_click", "2026-10-11T12:00:00Z", { campaignId: a });
    await ev(org, "view", "2026-10-10T12:00:00Z", { campaignId: b });
    await ev(org, "share", "2026-10-10T12:00:00Z");
    const m = await getMetrics(org.ctx, { periodo: "7" }, NOW);
    expect(m.byCampaign).toEqual([
      { campaignId: a, name: "Semana do Arroz", views: 2, whatsappClicks: 1, shares: 0 },
      { campaignId: b, name: "Feira de Sábado", views: 1, whatsappClicks: 0, shares: 0 },
      { campaignId: null, name: null, views: 0, whatsappClicks: 0, shares: 1 },
    ]);
  });

  it("conta campanhas criadas, publicadas e encerradas e exportações concluídas/falhas por formato", async () => {
    const org = await makeOrg();
    const db = getDb();
    const a = await campaign(org, "A");
    const b = await campaign(org, "B");
    await db.update(schema.campaigns).set({ createdAt: new Date("2026-10-10T12:00:00Z") }).where(eq(schema.campaigns.id, a));
    await db.update(schema.campaigns).set({ createdAt: new Date("2026-08-01T12:00:00Z") }).where(eq(schema.campaigns.id, b));
    const audit = (id: string, action: string, at: string) => db.insert(schema.auditLog).values({ orgId: org.orgId, userId: org.userId, action, entityType: "campaign", entityId: id, summary: action, createdAt: new Date(at) });
    await audit(a, "campaign.publish", "2026-10-10T12:00:00Z");
    await audit(a, "campaign.publish", "2026-10-11T12:00:00Z"); // republicação: mesma campanha conta 1
    await audit(b, "campaign.publish", "2026-10-09T12:00:00Z");
    await audit(b, "campaign.end", "2026-10-11T12:00:00Z");
    await audit(b, "campaign.end", "2026-08-01T12:00:00Z");
    const job = (status: "concluida" | "falhou" | "na_fila", request: { kind: "single" | "package"; items: Array<{ format: string; fileType: "png" | "pdf" }> }, at = "2026-10-10T12:00:00Z") =>
      db.insert(schema.exportJobs).values({ id: newId("exp"), orgId: org.orgId, campaignId: a, campaignVersion: 1, request, status, createdBy: org.userId, createdAt: new Date(at), finishedAt: status === "na_fila" ? null : new Date(at) });
    await job("concluida", { kind: "package", items: [{ format: "encarte_a4", fileType: "pdf" }, { format: "story", fileType: "png" }] });
    await job("concluida", { kind: "single", items: [{ format: "story", fileType: "png" }] });
    await job("falhou", { kind: "single", items: [{ format: "cartaz_a4", fileType: "pdf" }] });
    await job("na_fila", { kind: "single", items: [{ format: "story", fileType: "png" }] });
    await job("concluida", { kind: "single", items: [{ format: "story", fileType: "png" }] }, "2026-06-01T12:00:00Z");

    const m = await getMetrics(org.ctx, { periodo: "7" }, NOW);
    expect(m.campaigns).toEqual({ created: 1, published: 2, ended: 1 });
    expect(m.exports.completed).toBe(2);
    expect(m.exports.failed).toBe(1);
    expect(m.exports.packages).toBe(1);
    expect(m.exports.byFormat).toEqual(expect.arrayContaining([
      { format: "story", completed: 2, failed: 0 },
      { format: "encarte_a4", completed: 1, failed: 0 },
      { format: "cartaz_a4", completed: 0, failed: 1 },
    ]));
    expect(m.exports.byFormat).toHaveLength(3);
  });
});

describe("métricas: isolamento e lojas", () => {
  it("a conta A nunca vê os números da conta B (nem pelo parâmetro loja)", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    await ev(a, "view", "2026-10-11T12:00:00Z", { source: "qr" });
    for (let i = 0; i < 5; i++) await ev(b, "view", "2026-10-11T12:00:00Z", { source: "instagram" });
    await ev(b, "whatsapp_click", "2026-10-11T12:00:00Z");
    const bc = await campaign(b, "Campanha secreta de B");
    await getDb().insert(schema.auditLog).values({ orgId: b.orgId, userId: b.userId, action: "campaign.publish", entityType: "campaign", entityId: bc, summary: "x", createdAt: new Date("2026-10-11T12:00:00Z") });

    const ma = await getMetrics(a.ctx, { periodo: "7" }, NOW);
    expect(ma.totals).toEqual({ views: 1, whatsappClicks: 0, shares: 0, qrAccesses: 1 });
    expect(ma.byOrigin.map((r) => r.source)).toEqual(["qr"]);
    expect(ma.campaigns.published).toBe(0);
    expect(ma.stores.map((s) => s.id)).toEqual([a.storeId]);
    expect(JSON.stringify(ma)).not.toContain("secreta");
    await expect(getMetrics(a.ctx, { periodo: "7", loja: b.storeId }, NOW)).rejects.toMatchObject({ status: 404 });

    const mb = await getMetrics(b.ctx, { periodo: "7" }, NOW);
    expect(mb.totals.views).toBe(5);
  });

  it("filtra por loja e respeita membros restritos a uma filial", async () => {
    const org = await makeOrg();
    const s2 = await secondStore(org);
    await ev(org, "view", "2026-10-11T12:00:00Z");
    await ev(org, "view", "2026-10-11T12:00:00Z", { storeId: s2 });
    await ev(org, "view", "2026-10-11T12:00:00Z", { storeId: s2 });

    const all = await getMetrics(org.ctx, { periodo: "7" }, NOW);
    expect(all.totals.views).toBe(3);
    expect(all.stores).toHaveLength(2);
    expect((await getMetrics(org.ctx, { periodo: "7", loja: s2 }, NOW)).totals.views).toBe(2);
    expect((await getMetrics(org.ctx, { periodo: "7", loja: org.storeId }, NOW)).totals.views).toBe(1);

    const branch = await addMember(org, "editor", [s2]);
    const mine = await getMetrics(branch.ctx, { periodo: "7" }, NOW);
    expect(mine.totals.views).toBe(2);
    expect(mine.stores.map((s) => s.id)).toEqual([s2]);
    await expect(getMetrics(branch.ctx, { periodo: "7", loja: org.storeId }, NOW)).rejects.toMatchObject({ status: 403 });
  });

  it("GET /api/metrics: qualquer membro lê; sem sessão 401; período inválido 422", async () => {
    const org = await makeOrg();
    const approver = await addMember(org, "aprovador");
    const ok = await call(metricsRoute.GET, req("GET", "/api/metrics?periodo=7", { token: approver.token }));
    expect(ok.status).toBe(200);
    expect(ok.json.series).toHaveLength(7);
    expect(ok.json.totals).toEqual({ views: 0, whatsappClicks: 0, shares: 0, qrAccesses: 0 });
    expect((await call(metricsRoute.GET, req("GET", "/api/metrics"))).status).toBe(401);
    expect((await call(metricsRoute.GET, req("GET", "/api/metrics?periodo=12", { token: org.token }))).status).toBe(422);
  });
});

describe("link de campanha", () => {
  it("normaliza a origem igual à vitrine e monta o link com campanha e origem", () => {
    for (const s of ["WhatsApp", " Cartaz da Padaria! ", "Instagram Stories", "São João 2026", "", "@@@", "x".repeat(80)]) {
      expect(normalizeOrigin(s)).toBe(normalizeSource(s));
    }
    expect(storefrontLink("https://app.exemplo.com/loja/", "mercado-bom", { campaignId: "cmp_1", origin: "Panfleto Bairro" }))
      .toBe("https://app.exemplo.com/loja/mercado-bom?campanha=cmp_1&origem=panfleto-bairro");
    expect(storefrontLink("https://app.exemplo.com/loja", "mercado-bom")).toBe("https://app.exemplo.com/loja/mercado-bom");
  });

  it("?campanha= mostra só a campanha do link e atribui a visita a ela; sem o parâmetro a vitrine continua completa", async () => {
    const org = await makeOrg();
    const p = await makeProduct(org, { name: "Café 500g", unit: "pct", category: "Mercearia" });
    const q = await makeProduct(org, { name: "Leite 1L", unit: "un", category: "Laticínios" });
    const ids: string[] = [];
    for (const [name, prod] of [["Café", p.id], ["Leite", q.id]] as const) {
      const st = await createCampaign(org.ctx, { storeId: org.storeId, name, templateId: templateId(), startsAt: days(-1).toISOString(), endsAt: days(3).toISOString(), productIds: [prod] });
      await transitionCampaign(org.ctx, st.campaign.id, "approve");
      await transitionCampaign(org.ctx, st.campaign.id, "publish");
      ids.push(st.campaign.id);
    }
    const [store] = await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId));
    const slug = store!.slug;
    type El = { props: { data: { campaigns: Array<{ id: string }>; allOffersHref?: string | null } } };
    const render = async (sp: Record<string, string>) => (await LojaPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(sp) })) as unknown as El;

    const full = await render({});
    expect(full.props.data.campaigns.map((c) => c.id).sort()).toEqual([...ids].sort());
    expect(full.props.data.allOffersHref ?? null).toBeNull();

    const focused = await render({ campanha: ids[1]!, origem: "Instagram" });
    expect(focused.props.data.campaigns.map((c) => c.id)).toEqual([ids[1]]);
    expect(focused.props.data.allOffersHref).toBe(`/loja/${slug}?origem=Instagram`);

    const unknown = await render({ campanha: "cmp_inexistente" });
    expect(unknown.props.data.campaigns).toHaveLength(2);

    const evs = await getDb().select().from(schema.storefrontEvents).where(eq(schema.storefrontEvents.storeId, org.storeId));
    expect(evs.filter((e) => e.campaignId === ids[1] && e.source === "instagram" && e.kind === "view")).toHaveLength(1);
    // campanha inexistente/de outra loja não é gravada
    expect(evs.filter((e) => e.campaignId === "cmp_inexistente")).toHaveLength(0);
    const m = await getMetrics(org.ctx, { periodo: "7" });
    expect(m.byCampaign.find((r) => r.campaignId === ids[1])).toMatchObject({ name: "Leite", views: 1 });
  });
});
