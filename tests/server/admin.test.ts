// Administração da plataforma: acesso exclusivo, registro de ações, planos, contas (plano manual,
// teste, suspensão) e publicação de modelos sem alterar campanhas existentes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getTemplate, TEMPLATE_VERSIONS } from "@/templates/registry";
import { PieceRenderer } from "@/render/PieceRenderer";
import { createCampaign, getEditorState, switchTemplate } from "@/server/services/campaigns";
import { createStore } from "@/server/services/stores";
import * as overviewRoute from "@/app/api/admin/overview/route";
import * as tplRoute from "@/app/api/admin/templates/route";
import * as tplIdRoute from "@/app/api/admin/templates/[id]/route";
import * as tplCampaignsRoute from "@/app/api/admin/templates/[id]/campaigns/route";
import * as tplVersionRoute from "@/app/api/admin/templates/[id]/versions/[version]/route";
import * as plansRoute from "@/app/api/admin/plans/route";
import * as planIdRoute from "@/app/api/admin/plans/[id]/route";
import * as accountsRoute from "@/app/api/admin/accounts/route";
import * as accountIdRoute from "@/app/api/admin/accounts/[id]/route";
import * as accountPlanRoute from "@/app/api/admin/accounts/[id]/plan/route";
import * as accountTrialRoute from "@/app/api/admin/accounts/[id]/trial/route";
import * as accountSuspendRoute from "@/app/api/admin/accounts/[id]/suspend/route";
import * as accountReactivateRoute from "@/app/api/admin/accounts/[id]/reactivate/route";
import * as exportsRoute from "@/app/api/admin/exports/route";
import * as exportRetryRoute from "@/app/api/admin/exports/[id]/retry/route";
import * as usageRoute from "@/app/api/admin/usage/route";
import * as billingRoute from "@/app/api/admin/billing-events/route";
import * as auditRoute from "@/app/api/admin/audit/route";
import * as publicTemplatesRoute from "@/app/api/templates/route";
import * as productsRoute from "@/app/api/products/route";
import * as meRoute from "@/app/api/me/route";
import * as orgRoute from "@/app/api/org/route";
import * as orgExportRoute from "@/app/api/org/export/route";
import * as campaignsRoute from "@/app/api/campaigns/route";
import * as renderDataRoute from "@/app/api/campaigns/[id]/render-data/route";
import { call, makeOrg, makeProduct, req, uid, type TestOrg } from "./helpers";

let admin: TestOrg;
let plain: TestOrg;

async function makePlatformAdmin() {
  const o = await makeOrg();
  await getDb().update(schema.users).set({ isPlatformAdmin: true }).where(eq(schema.users.id, o.userId));
  return o;
}

async function lastAdminAudit(action: string) {
  const [row] = await getDb().select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.action, action)).orderBy(desc(schema.adminAuditLog.id)).limit(1);
  return row;
}

beforeAll(async () => {
  admin = await makePlatformAdmin();
  plain = await makeOrg();
});

// Todas as rotas da administração com um exemplo de chamada.
const ENDPOINTS: Array<{ name: string; handler: unknown; method: string; url: string; params?: () => Record<string, string>; body?: unknown }> = [
  { name: "overview", handler: overviewRoute.GET, method: "GET", url: "/api/admin/overview" },
  { name: "templates", handler: tplRoute.GET, method: "GET", url: "/api/admin/templates" },
  { name: "template settings", handler: tplIdRoute.PATCH, method: "PATCH", url: "/api/admin/templates/x", params: () => ({ id: TEMPLATE_VERSIONS[0]!.id }), body: { isActive: false } },
  { name: "template campaigns", handler: tplCampaignsRoute.GET, method: "GET", url: "/api/admin/templates/x/campaigns", params: () => ({ id: TEMPLATE_VERSIONS[0]!.id }) },
  { name: "template release", handler: tplVersionRoute.PUT, method: "PUT", url: "/api/admin/templates/x/versions/1", params: () => ({ id: TEMPLATE_VERSIONS[0]!.id, version: "1" }), body: { isPublished: false } },
  { name: "plans", handler: plansRoute.GET, method: "GET", url: "/api/admin/plans" },
  { name: "plan create", handler: plansRoute.POST, method: "POST", url: "/api/admin/plans", body: { id: `hack-${uid()}`, name: "Hack", limits: { stores: 1, users: 1, storageMb: 1, exportsPerMonth: 1, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: [] } } },
  { name: "plan update", handler: planIdRoute.PATCH, method: "PATCH", url: "/api/admin/plans/inicial", params: () => ({ id: "inicial" }), body: { name: "Hackeado" } },
  { name: "accounts", handler: accountsRoute.GET, method: "GET", url: "/api/admin/accounts" },
  { name: "account detail", handler: accountIdRoute.GET, method: "GET", url: "/api/admin/accounts/x", params: () => ({ id: plain.orgId }) },
  { name: "account plan", handler: accountPlanRoute.POST, method: "POST", url: "/api/admin/accounts/x/plan", params: () => ({ id: plain.orgId }), body: { planId: "redes" } },
  { name: "account trial", handler: accountTrialRoute.POST, method: "POST", url: "/api/admin/accounts/x/trial", params: () => ({ id: plain.orgId }), body: { days: 30 } },
  { name: "account suspend", handler: accountSuspendRoute.POST, method: "POST", url: "/api/admin/accounts/x/suspend", params: () => ({ id: plain.orgId }), body: { reason: "tentativa indevida" } },
  { name: "account reactivate", handler: accountReactivateRoute.POST, method: "POST", url: "/api/admin/accounts/x/reactivate", params: () => ({ id: plain.orgId }), body: {} },
  { name: "exports", handler: exportsRoute.GET, method: "GET", url: "/api/admin/exports" },
  { name: "export retry", handler: exportRetryRoute.POST, method: "POST", url: "/api/admin/exports/x/retry", params: () => ({ id: "exp_inexistente" }) },
  { name: "usage", handler: usageRoute.GET, method: "GET", url: "/api/admin/usage" },
  { name: "billing", handler: billingRoute.GET, method: "GET", url: "/api/admin/billing-events" },
  { name: "audit", handler: auditRoute.GET, method: "GET", url: "/api/admin/audit" },
];

describe("acesso à administração da plataforma", () => {
  it("quem não é administrador da plataforma (com ou sem sessão) recebe 404 em TODAS as rotas, e nada muda", async () => {
    const auditBefore = await getDb().select({ id: schema.adminAuditLog.id }).from(schema.adminAuditLog);
    for (const token of [null, plain.token]) {
      for (const e of ENDPOINTS) {
        const r = await call(e.handler, req(e.method, e.url, { token, body: e.body }), e.params?.() ?? {});
        expect([403, 404], `${e.name} (${token ? "não admin" : "sem sessão"})`).toContain(r.status);
        expect(r.json.error.code).toBe("not_found");
      }
    }
    const [inicial] = await getDb().select().from(schema.plans).where(eq(schema.plans.id, "inicial"));
    expect(inicial!.name).toBe("Inicial");
    const [org] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, plain.orgId));
    expect(org!.suspendedAt).toBeNull();
    expect(org!.planId).toBe("inicial");
    const auditAfter = await getDb().select({ id: schema.adminAuditLog.id }).from(schema.adminAuditLog);
    expect(auditAfter.length).toBe(auditBefore.length);
  });

  it("administrador da plataforma acessa as rotas de leitura", async () => {
    for (const e of ENDPOINTS.filter((x) => x.method === "GET")) {
      const r = await call(e.handler, req("GET", e.url, { token: admin.token }), e.params?.() ?? {});
      expect(r.status, e.name).toBe(200);
    }
    const acc = await call(accountsRoute.GET, req("GET", `/api/admin/accounts?q=${encodeURIComponent(plain.email)}`, { token: admin.token }));
    expect(acc.json.accounts.map((a: { id: string }) => a.id)).toContain(plain.orgId);
    const detail = await call(accountIdRoute.GET, req("GET", "/api/admin/accounts/x", { token: admin.token }), { id: plain.orgId });
    expect(detail.json.members[0]).toMatchObject({ email: plain.email, role: "admin" });
    // nunca hash de senha nem dados de sessão
    const text = JSON.stringify(detail.json);
    expect(text).not.toMatch(/passwordHash|password_hash|sessionId|"sessions"|tokenHash/);
  });

  it("perder a permissão vale na hora (a sessão relê o banco a cada requisição)", async () => {
    const o = await makePlatformAdmin();
    expect((await call(overviewRoute.GET, req("GET", "/api/admin/overview", { token: o.token }))).status).toBe(200);
    await getDb().update(schema.users).set({ isPlatformAdmin: false }).where(eq(schema.users.id, o.userId));
    expect((await call(overviewRoute.GET, req("GET", "/api/admin/overview", { token: o.token }))).status).toBe(404);
  });
});

describe("planos e limites", () => {
  const planId = `teste-${uid()}`;
  const limits = { stores: 2, users: 3, storageMb: 512, exportsPerMonth: 100, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: ["vitrine"] };

  it("cria e edita plano com validação (sem negativos, absurdos ou frações) e registra a ação", async () => {
    const created = await call(plansRoute.POST, req("POST", "/api/admin/plans", { token: admin.token, body: { id: planId, name: "Plano de teste", limits } }));
    expect(created.status).toBe(201);
    expect(created.json.plan).toMatchObject({ id: planId, priceCents: null, isActive: true });
    const dup = await call(plansRoute.POST, req("POST", "/api/admin/plans", { token: admin.token, body: { id: planId, name: "Outro", limits } }));
    expect(dup.status).toBe(409);

    const bad: unknown[] = [
      { limits: { ...limits, stores: -1 } },
      { limits: { ...limits, stores: 0 } },
      { limits: { ...limits, storageMb: 1.5 } },
      { limits: { ...limits, exportsPerMonth: 1e12 } },
      { limits: { ...limits, features: ["Não Pode"] } },
      { priceCents: -100 },
      { priceCents: 19.9 },
      { priceCents: 1e10 },
      { name: "" },
      { providerPriceId: "price com espaço" },
      { inventado: true },
      {},
    ];
    for (const body of bad) {
      const r = await call(planIdRoute.PATCH, req("PATCH", `/api/admin/plans/${planId}`, { token: admin.token, body }), { id: planId });
      expect(r.status, JSON.stringify(body)).toBe(422);
    }
    const ok = await call(planIdRoute.PATCH, req("PATCH", `/api/admin/plans/${planId}`, { token: admin.token, body: { name: "Plano Teste", priceCents: 14990, providerPriceId: "price_test_123", sortOrder: 5, limits: { ...limits, stores: 4 } } }), { id: planId });
    expect(ok.status).toBe(200);
    expect(ok.json.plan).toMatchObject({ name: "Plano Teste", priceCents: 14990, providerPriceId: "price_test_123", sortOrder: 5, limits: { stores: 4 } });
    const back = await call(planIdRoute.PATCH, req("PATCH", `/api/admin/plans/${planId}`, { token: admin.token, body: { priceCents: null, providerPriceId: "" } }), { id: planId });
    expect(back.json.plan).toMatchObject({ priceCents: null, providerPriceId: null });
    const audit = await lastAdminAudit("plan.update");
    expect(audit).toMatchObject({ adminUserId: admin.userId, targetType: "plan", targetId: planId });
    expect((audit!.details as { changed: string[] }).changed).toEqual(expect.arrayContaining(["priceCents", "providerPriceId"]));
    const missing = await call(planIdRoute.PATCH, req("PATCH", "/api/admin/plans/nao-existe", { token: admin.token, body: { name: "X Y" } }), { id: "nao-existe" });
    expect(missing.status).toBe(404);
  });

  it("reduzir limites não apaga dados: lojas acima do novo limite continuam", async () => {
    const org = await makeOrg({ plan: planId });
    await createStore(org.ctx, { name: `Filial ${uid()}` });
    await createStore(org.ctx, { name: `Filial ${uid()}` });
    const r = await call(planIdRoute.PATCH, req("PATCH", `/api/admin/plans/${planId}`, { token: admin.token, body: { limits: { ...limits, stores: 1 } } }), { id: planId });
    expect(r.status).toBe(200);
    const stores = await getDb().select().from(schema.stores).where(eq(schema.stores.orgId, org.orgId));
    expect(stores.filter((s) => !s.deletedAt)).toHaveLength(3);
    await expect(createStore(org.ctx, { name: "Mais uma" })).rejects.toMatchObject({ code: "limit_reached" });
  });
});

describe("contas", () => {
  it("troca manual de plano grava organização, assinatura manual (criada se faltar) e evento de cobrança manual", async () => {
    const org = await makeOrg();
    await getDb().delete(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    const bad = await call(accountPlanRoute.POST, req("POST", "/x", { token: admin.token, body: { planId: "nao-existe" } }), { id: org.orgId });
    expect(bad.status).toBe(422);
    const r = await call(accountPlanRoute.POST, req("POST", "/x", { token: admin.token, body: { planId: "profissional", note: "cortesia" } }), { id: org.orgId });
    expect(r.status).toBe(200);
    const [o] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, org.orgId));
    expect(o!.planId).toBe("profissional");
    const subs = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ planId: "profissional", provider: "manual", status: "ativa" });
    const evs = await getDb().select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.orgId));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ provider: "manual", status: "processado" });
    expect(evs[0]!.summary).toMatchObject({ planId: "profissional", status: "ativa" });
    const audit = await lastAdminAudit("org.plan_change");
    expect(audit).toMatchObject({ adminUserId: admin.userId, targetId: org.orgId });
    expect(audit!.details).toMatchObject({ fromPlanId: "inicial", toPlanId: "profissional", note: "cortesia" });

    // segunda troca reaproveita a mesma assinatura
    await call(accountPlanRoute.POST, req("POST", "/x", { token: admin.token, body: { planId: "redes", status: "teste" } }), { id: org.orgId });
    const subs2 = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(subs2).toHaveLength(1);
    expect(subs2[0]).toMatchObject({ planId: "redes", status: "teste", provider: "manual" });
    expect(await getDb().select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.orgId))).toHaveLength(2);
    const billing = await call(billingRoute.GET, req("GET", `/api/admin/billing-events?orgId=${org.orgId}&provider=manual`, { token: admin.token }));
    expect(billing.json.events).toHaveLength(2);
  });

  it("estende o teste somando dias; recusa conta com assinatura ativa", async () => {
    const org = await makeOrg();
    await getDb().delete(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    const bad = await call(accountTrialRoute.POST, req("POST", "/x", { token: admin.token, body: { days: 365 } }), { id: org.orgId });
    expect(bad.status).toBe(422);
    const r1 = await call(accountTrialRoute.POST, req("POST", "/x", { token: admin.token, body: { days: 10 } }), { id: org.orgId });
    expect(r1.status).toBe(200);
    const [s1] = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(s1!.status).toBe("teste");
    await call(accountTrialRoute.POST, req("POST", "/x", { token: admin.token, body: { days: 5 } }), { id: org.orgId });
    const [s2] = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(Math.round((s2!.trialEndsAt!.getTime() - s1!.trialEndsAt!.getTime()) / 86_400_000)).toBe(5);
    expect(await lastAdminAudit("org.trial_extend")).toMatchObject({ targetId: org.orgId });
    await call(accountPlanRoute.POST, req("POST", "/x", { token: admin.token, body: { planId: "inicial", status: "ativa" } }), { id: org.orgId });
    const r3 = await call(accountTrialRoute.POST, req("POST", "/x", { token: admin.token, body: { days: 5 } }), { id: org.orgId });
    expect(r3.status).toBe(422);
  });

  it("suspensão bloqueia leituras e escritas da conta (account_suspended), exceto /api/me e a exportação dos dados", async () => {
    const org = await makeOrg();
    await makeProduct(org);
    const noReason = await call(accountSuspendRoute.POST, req("POST", "/x", { token: admin.token, body: { reason: "" } }), { id: org.orgId });
    expect(noReason.status).toBe(422);
    const s = await call(accountSuspendRoute.POST, req("POST", "/x", { token: admin.token, body: { reason: "Uso indevido da vitrine" } }), { id: org.orgId });
    expect(s.status).toBe(200);
    const audit = await lastAdminAudit("org.suspend");
    expect(audit).toMatchObject({ adminUserId: admin.userId, targetType: "organization", targetId: org.orgId });
    expect(audit!.details).toMatchObject({ reason: "Uso indevido da vitrine" });

    const read = await call(productsRoute.GET, req("GET", "/api/products", { token: org.token }));
    expect(read.status).toBe(403);
    expect(read.json.error.code).toBe("account_suspended");
    expect(read.json.error.message).toMatch(/suspensa/);
    const write = await call(productsRoute.POST, req("POST", "/api/products", { token: org.token, body: { name: "Novo", unit: "un", regularCents: 100 } }));
    expect(write.status).toBe(403);
    expect(write.json.error.code).toBe("account_suspended");
    const orgRead = await call(orgRoute.GET, req("GET", "/api/org", { token: org.token }));
    expect(orgRead.json.error.code).toBe("account_suspended");
    const camp = await call(campaignsRoute.POST, req("POST", "/api/campaigns", { token: org.token, body: { storeId: org.storeId, name: "x" } }));
    expect(camp.json.error.code).toBe("account_suspended");

    const me = await call(meRoute.GET, req("GET", "/api/me", { token: org.token }));
    expect(me.status).toBe(200);
    const exp = await call(orgExportRoute.GET, req("GET", "/api/org/export", { token: org.token }));
    expect(exp.status).toBe(200);
    expect(JSON.stringify(exp.json)).not.toMatch(/passwordHash/);

    // outras contas não são afetadas
    expect((await call(productsRoute.GET, req("GET", "/api/products", { token: plain.token }))).status).toBe(200);

    const again = await call(accountSuspendRoute.POST, req("POST", "/x", { token: admin.token, body: { reason: "de novo, de novo" } }), { id: org.orgId });
    expect(again.status).toBe(409);
    const re = await call(accountReactivateRoute.POST, req("POST", "/x", { token: admin.token, body: { note: "resolvido" } }), { id: org.orgId });
    expect(re.status).toBe(200);
    expect(await lastAdminAudit("org.reactivate")).toMatchObject({ targetId: org.orgId });
    const after = await call(productsRoute.GET, req("GET", "/api/products", { token: org.token }));
    expect(after.status).toBe(200);
  });

  it("reenviar exportação só vale para exportações com falha", async () => {
    const missing = await call(exportRetryRoute.POST, req("POST", "/x", { token: admin.token }), { id: "exp_nao_existe" });
    expect(missing.status).toBe(404);
    const org = await makeOrg();
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Exportar" });
    const id = `exp_${uid()}`;
    await getDb().insert(schema.exportJobs).values({ id, orgId: org.orgId, campaignId: st.campaign.id, campaignVersion: 1, request: { kind: "single", items: [{ format: "post_feed", fileType: "png" }] }, status: "concluida", createdBy: org.userId });
    const r = await call(exportRetryRoute.POST, req("POST", "/x", { token: admin.token }), { id });
    expect(r.status).toBe(409);
    await getDb().update(schema.exportJobs).set({ status: "falhou", error: "Falha simulada" }).where(eq(schema.exportJobs.id, id));
    const list = await call(exportsRoute.GET, req("GET", `/api/admin/exports?orgId=${org.orgId}`, { token: admin.token }));
    expect(list.json.jobs.map((j: { id: string }) => j.id)).toContain(id);
    expect(list.json.jobs[0]).toMatchObject({ error: "Falha simulada", orgName: expect.any(String) });
  });
});

describe("modelos: publicação sem alterar campanhas existentes", () => {
  // modelo com 3 versões no registro
  const multi = [...new Set(TEMPLATE_VERSIONS.map((t) => t.id))].find((id) => TEMPLATE_VERSIONS.filter((t) => t.id === id).length >= 3)!;
  const other = [...new Set(TEMPLATE_VERSIONS.map((t) => t.id))].find((id) => id !== multi)!;
  const latest = getTemplate(multi)!.version;

  afterAll(async () => {
    // devolve o estado padrão (outros arquivos de teste usam os modelos)
    await getDb().delete(schema.templateReleases);
    await getDb().delete(schema.templateSettings);
  });

  it("despublicar a última versão: campanhas novas usam a anterior publicada; antigas mantêm a versão e continuam renderizando", async () => {
    const org = await makeOrg();
    await makeProduct(org, { name: "Arroz de teste 5kg" });
    const [prod] = await getDb().select().from(schema.products).where(eq(schema.products.orgId, org.orgId));
    const before = await createCampaign(org.ctx, { storeId: org.storeId, name: "Antes", templateId: multi, productIds: [prod!.id] });
    expect(before.campaign.templateVersion).toBe(latest);

    const r = await call(tplVersionRoute.PUT, req("PUT", "/x", { token: admin.token, body: { isPublished: false, notes: "revisão" } }), { id: multi, version: String(latest) });
    expect(r.status).toBe(200);
    expect(r.json.campaignsKeepingVersion).toBeGreaterThanOrEqual(1);
    expect(await lastAdminAudit("template.unpublish")).toMatchObject({ adminUserId: admin.userId, targetId: `${multi}@${latest}` });

    // galeria oferece a versão anterior publicada
    const gallery = await call(publicTemplatesRoute.GET, req("GET", "/api/templates", { token: org.token }));
    const g = gallery.json.templates.find((t: { id: string }) => t.id === multi);
    expect(g.version).toBe(latest - 1);
    expect(g.versions).not.toContain(latest);

    // campanha nova não usa a versão despublicada
    const after = await createCampaign(org.ctx, { storeId: org.storeId, name: "Depois", templateId: multi });
    expect(after.campaign.templateVersion).toBe(latest - 1);

    // campanha antiga continua fixada e renderiza com a versão dela
    const old = await getEditorState(org.ctx, before.campaign.id);
    expect(old.campaign.templateVersion).toBe(latest);
    expect(old.template).toMatchObject({ version: latest, latestVersion: latest }); // nada "mais novo" publicado → sem migração
    const rd = await call(renderDataRoute.GET, req("GET", `/api/campaigns/${before.campaign.id}/render-data`, { token: org.token }), { id: before.campaign.id });
    expect(rd.status).toBe(200);
    const html = renderToStaticMarkup(createElement(PieceRenderer, { campaign: rd.json, template: { id: multi, version: latest }, format: "post_feed" }));
    expect(html).toContain("Arroz de teste");
    expect(html).not.toContain("data-ev-render-error");

    // troca explícita para a versão despublicada é recusada; manter a própria versão é permitido
    await expect(switchTemplate(org.ctx, after.campaign.id, { templateId: multi, templateVersion: latest })).rejects.toMatchObject({ code: "validation" });
    const same = await switchTemplate(org.ctx, before.campaign.id, { templateId: multi, templateVersion: latest });
    expect(same.campaign.templateVersion).toBe(latest);

    // a administração só consulta campanhas por versão (sem migrar)
    const list = await call(tplCampaignsRoute.GET, req("GET", `/x?version=${latest}`, { token: admin.token }), { id: multi });
    expect(list.json.campaigns.map((c: { id: string }) => c.id)).toContain(before.campaign.id);
    const [row] = await getDb().select().from(schema.campaigns).where(eq(schema.campaigns.id, before.campaign.id));
    expect(row!.templateVersion).toBe(latest);
  });

  it("migração explícita no editor vai para a última versão PUBLICADA", async () => {
    const org = await makeOrg();
    // campanha antiga fixada na v1
    const c = await createCampaign(org.ctx, { storeId: org.storeId, name: "Antiga", templateId: multi });
    await getDb().update(schema.campaigns).set({ templateVersion: 1 }).where(and(eq(schema.campaigns.id, c.campaign.id), eq(schema.campaigns.orgId, org.orgId)));
    const st = await getEditorState(org.ctx, c.campaign.id);
    expect(st.template).toMatchObject({ version: 1, latestVersion: latest - 1 }); // v{latest} está despublicada (teste anterior)
    const migrated = await switchTemplate(org.ctx, c.campaign.id, { templateId: multi, templateVersion: st.template.latestVersion, baseVersion: st.campaign.version });
    expect(migrated.campaign.templateVersion).toBe(latest - 1);
    // republicar volta a oferecer a versão mais nova, sem mexer em campanhas
    const pub = await call(tplVersionRoute.PUT, req("PUT", "/x", { token: admin.token, body: { isPublished: true } }), { id: multi, version: String(latest) });
    expect(pub.status).toBe(200);
    expect((await getEditorState(org.ctx, c.campaign.id)).campaign.templateVersion).toBe(latest - 1);
    expect((await getEditorState(org.ctx, c.campaign.id)).template.latestVersion).toBe(latest);
  });

  it("não deixa despublicar a única versão publicada de um modelo ativo", async () => {
    const versions = TEMPLATE_VERSIONS.filter((t) => t.id === other).map((t) => t.version).sort((a, b) => b - a);
    for (const v of versions.slice(0, -1)) {
      const r = await call(tplVersionRoute.PUT, req("PUT", "/x", { token: admin.token, body: { isPublished: false } }), { id: other, version: String(v) });
      expect(r.status).toBe(200);
    }
    const last = await call(tplVersionRoute.PUT, req("PUT", "/x", { token: admin.token, body: { isPublished: false } }), { id: other, version: String(versions.at(-1)) });
    expect(last.status).toBe(422);
    const unknown = await call(tplVersionRoute.PUT, req("PUT", "/x", { token: admin.token, body: { isPublished: false } }), { id: other, version: "999" });
    expect(unknown.status).toBe(404);
    await getDb().delete(schema.templateReleases).where(eq(schema.templateReleases.templateId, other));
  });

  it("modelo inativo some da galeria e de campanhas novas; categoria e ordem aparecem para os clientes", async () => {
    const org = await makeOrg();
    const existing = await createCampaign(org.ctx, { storeId: org.storeId, name: "Já existia", templateId: other });
    const off = await call(tplIdRoute.PATCH, req("PATCH", "/x", { token: admin.token, body: { isActive: false } }), { id: other });
    expect(off.status).toBe(200);
    expect(await lastAdminAudit("template.settings")).toMatchObject({ targetId: other });
    const bad = await call(tplIdRoute.PATCH, req("PATCH", "/x", { token: admin.token, body: { sortOrder: 99999 } }), { id: other });
    expect(bad.status).toBe(422);

    const gallery = await call(publicTemplatesRoute.GET, req("GET", "/api/templates", { token: org.token }));
    expect(gallery.json.templates.map((t: { id: string }) => t.id)).not.toContain(other);
    const create = await call(campaignsRoute.POST, req("POST", "/api/campaigns", { token: org.token, body: { storeId: org.storeId, name: "Nova", templateId: other } }));
    expect(create.status).toBe(422);
    // campanha existente segue funcionando
    const st = await getEditorState(org.ctx, existing.campaign.id);
    expect(st.campaign.templateId).toBe(other);

    await call(tplIdRoute.PATCH, req("PATCH", "/x", { token: admin.token, body: { isActive: true, category: "Promoções", sortOrder: -10 } }), { id: other });
    const g2 = await call(publicTemplatesRoute.GET, req("GET", "/api/templates", { token: org.token }));
    expect(g2.json.templates[0]).toMatchObject({ id: other, category: "Promoções" });
    const adminList = await call(tplRoute.GET, req("GET", "/api/admin/templates", { token: admin.token }));
    const t = adminList.json.templates.find((x: { id: string }) => x.id === other);
    expect(t.campaignCount).toBeGreaterThanOrEqual(1);
    expect(adminList.json.categories).toContain("Promoções");
  });
});
