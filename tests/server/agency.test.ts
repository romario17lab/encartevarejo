import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { clearAllRateLimits } from "@/server/auth/rate-limit";
import { createCampaign, saveCampaign } from "@/server/services/campaigns";
import { agencyStatus, createClientAccount, detachClient, enableAgencyMode, listClients } from "@/server/services/agency";
import {
  createPreviewLink, decidePreview, getPublicPreview, listPreviewLinks, loadPreviewBundle, revokePreviewLink, verifyPreviewPin, PIN_MAX_ATTEMPTS,
} from "@/server/services/preview-links";
import type { TenantCtx } from "@/server/context";
import * as activeOrgRoute from "@/app/api/me/active-org/route";
import * as productsRoute from "@/app/api/products/route";
import * as productRoute from "@/app/api/products/[id]/route";
import * as campaignRoute from "@/app/api/campaigns/[id]/route";
import * as clientsRoute from "@/app/api/agency/clients/route";
import * as detachRoute from "@/app/api/agency/clients/[id]/detach/route";
import * as previewLinksRoute from "@/app/api/preview-links/route";
import * as pinRoute from "@/app/api/public-preview/[token]/pin/route";
import * as decisionRoute from "@/app/api/public-preview/[token]/decision/route";
import { addMember, call, days, makeOrg, makeProduct, req, type TestOrg } from "./helpers";

const db = () => getDb();
const ctxIn = (orgId: string, userId: string, role: TenantCtx["role"] = "admin"): TenantCtx => ({ userId, orgId, role, storeIds: null, isPlatformAdmin: false });
const tokenOf = (url: string) => url.split("/aprovar/")[1]!;

let AG: TestOrg; // agência
let agencyEditor: Awaited<ReturnType<typeof addMember>>;
let clientA: { id: string; storeId: string };
let clientB: { id: string; storeId: string };

describe("modo agência", () => {
  beforeAll(async () => {
    AG = await makeOrg({ plan: "redes", orgName: "Agência Demo" });
    agencyEditor = await addMember(AG, "editor");
  });
  beforeEach(() => clearAllRateLimits());

  it("plano sem o recurso não ativa; plano Redes ativa e audita", async () => {
    const small = await makeOrg();
    await expect(enableAgencyMode(small.ctx)).rejects.toMatchObject({ code: "limit_reached" });
    await expect(createClientAccount(small.ctx, { name: "Cliente X", storeName: "Loja X" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(enableAgencyMode(agencyEditor.ctx)).rejects.toMatchObject({ code: "forbidden" });
    const st = await enableAgencyMode(AG.ctx);
    expect(st.isAgency).toBe(true);
    const [a] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, AG.orgId), eq(schema.auditLog.action, "org.agency_enable")));
    expect(a).toBeTruthy();
  });

  it("agência cria contas de cliente separadas, com vínculos escolhidos", async () => {
    await expect(createClientAccount(agencyEditor.ctx, { name: "Cliente", storeName: "Loja" })).rejects.toMatchObject({ code: "forbidden" });
    const outsider = await makeOrg();
    await expect(createClientAccount(AG.ctx, { name: "Cliente", storeName: "Loja", members: [{ userId: outsider.userId, role: "editor" }] }))
      .rejects.toMatchObject({ code: "validation" });

    clientA = await createClientAccount(AG.ctx, { name: "Mercado Alfa", storeName: "Alfa Centro", members: [{ userId: agencyEditor.userId, role: "editor" }] });
    clientB = await createClientAccount(AG.ctx, { name: "Mercado Beta", storeName: "Beta Centro" });
    const [org] = await db().select().from(schema.organizations).where(eq(schema.organizations.id, clientA.id));
    expect(org!.agencyOrgId).toBe(AG.orgId);
    expect(org!.kind).toBe("varejo");
    const kits = await db().select().from(schema.brandKits).where(eq(schema.brandKits.orgId, clientA.id));
    expect(kits).toHaveLength(1);
    const ms = await db().select().from(schema.memberships).where(eq(schema.memberships.orgId, clientA.id));
    expect(ms.map((m) => [m.userId, m.role]).sort()).toEqual([[AG.userId, "admin"], [agencyEditor.userId, "editor"]].sort());
    // auditoria dos dois lados
    expect((await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, AG.orgId), eq(schema.auditLog.action, "agency.client_create")))).length).toBe(2);
    expect((await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, clientA.id), eq(schema.auditLog.action, "org.create")))).length).toBe(1);
    // status do cliente indica a agência
    expect((await agencyStatus(ctxIn(clientA.id, AG.userId))).managedBy).toEqual({ id: AG.orgId, name: "Agência Demo" });
  });

  it("painel lista só clientes acessíveis, com contagens e sem dados privados", async () => {
    const p = await makeProduct({ ctx: ctxIn(clientA.id, AG.userId) } as TestOrg, { name: "Arroz secreto Alfa", costCents: 500 });
    await createCampaign(ctxIn(clientA.id, AG.userId), { storeId: clientA.storeId, name: "Ofertas Alfa", startsAt: days(0).toISOString(), endsAt: days(5).toISOString(), productIds: [p.id] });
    const forAdmin = await listClients(AG.ctx);
    expect(forAdmin.clients.map((c) => c.name)).toEqual(["Mercado Alfa", "Mercado Beta"]);
    expect(forAdmin.clients[0]!.counts).toEqual({ stores: 1, inReview: 0, scheduled: 0, published: 0, pendingApprovals: 0 });
    expect(JSON.stringify(forAdmin)).not.toMatch(/Arroz|costCents|Ofertas Alfa/);
    const forEditor = await listClients(agencyEditor.ctx);
    expect(forEditor.clients.map((c) => c.name)).toEqual(["Mercado Alfa"]);
    expect(forEditor.hiddenCount).toBe(1);
    // conta que não é agência não lista
    await expect(listClients(ctxIn(clientA.id, AG.userId))).rejects.toMatchObject({ code: "forbidden" });
    // HTTP
    const r = await call(clientsRoute.GET, req("GET", "/api/agency/clients", { token: agencyEditor.token }));
    expect(r.status).toBe(200);
    expect(r.json.clients).toHaveLength(1);
  });

  it("isolamento: membro do cliente A não lê B; troca de conta mostra só os dados da conta ativa", async () => {
    const bProduct = await makeProduct({ ctx: ctxIn(clientB.id, AG.userId) } as TestOrg, { name: "Feijão Beta" });
    const bCamp = await createCampaign(ctxIn(clientB.id, AG.userId), { storeId: clientB.storeId, name: "Campanha Beta", productIds: [bProduct.id] });
    // editor da agência (vínculo só com A) não pode ativar B
    const sw = await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: agencyEditor.token, body: { orgId: clientB.id } }));
    expect(sw.status).toBe(403);
    expect((await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: agencyEditor.token, body: { orgId: clientA.id } }))).status).toBe(200);
    expect((await call(productRoute.GET, req("GET", `/api/products/${bProduct.id}`, { token: agencyEditor.token }), { id: bProduct.id })).status).toBe(404);
    expect((await call(campaignRoute.GET, req("GET", `/api/campaigns/${bCamp.campaign.id}`, { token: agencyEditor.token }), { id: bCamp.campaign.id })).status).toBe(404);
    const listA = await call(productsRoute.GET, req("GET", "/api/products", { token: agencyEditor.token }));
    expect(listA.json.products.map((p: { name: string }) => p.name)).toEqual(["Arroz secreto Alfa"]);

    // admin da agência troca entre A e B: nunca vê dados de A estando em B
    expect((await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: AG.token, body: { orgId: clientB.id } }))).status).toBe(200);
    const listB = await call(productsRoute.GET, req("GET", "/api/products", { token: AG.token }));
    expect(listB.json.products.map((p: { name: string }) => p.name)).toEqual(["Feijão Beta"]);
    const created = await call(productsRoute.POST, req("POST", "/api/products", { token: AG.token, body: { name: "Criado em B", orgId: clientA.id } }));
    expect(created.status).toBe(201);
    const [row] = await db().select().from(schema.products).where(eq(schema.products.id, created.json.id));
    expect(row!.orgId).toBe(clientB.id);
    expect((await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: AG.token, body: { orgId: clientA.id } }))).status).toBe(200);
    const listA2 = await call(productsRoute.GET, req("GET", "/api/products", { token: AG.token }));
    expect(listA2.json.products.map((p: { name: string }) => p.name)).not.toContain("Feijão Beta");
    // volta para a agência
    await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: AG.token, body: { orgId: AG.orgId } }));
  });

  it("desligar: exige administrador próprio; agência perde acesso; auditado dos dois lados", async () => {
    const C = await createClientAccount(AG.ctx, { name: "Mercado Gama", storeName: "Gama", members: [{ userId: agencyEditor.userId, role: "aprovador" }] });
    // outra agência não enxerga o cliente
    const otherAgency = await makeOrg({ plan: "redes" });
    await enableAgencyMode(otherAgency.ctx);
    await expect(detachClient(otherAgency.ctx, C.id)).rejects.toMatchObject({ code: "not_found" });
    // sem administrador próprio do cliente: recusado
    await expect(detachClient(AG.ctx, C.id)).rejects.toMatchObject({ code: "validation" });
    const own = await addMember({ orgId: C.id } as TestOrg, "admin");
    // pessoa da agência com sessão ativa no cliente
    await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: agencyEditor.token, body: { orgId: C.id } }));
    const r = await call(detachRoute.POST, req("POST", `/api/agency/clients/${C.id}/detach`, { token: AG.token }), { id: C.id });
    expect(r.status).toBe(200);
    expect(r.json.removedMembers).toBe(2);
    const ms = await db().select().from(schema.memberships).where(eq(schema.memberships.orgId, C.id));
    expect(ms.map((m) => m.userId)).toEqual([own.userId]);
    const [org] = await db().select().from(schema.organizations).where(eq(schema.organizations.id, C.id));
    expect(org!.agencyOrgId).toBeNull();
    expect((await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, C.id), eq(schema.auditLog.action, "org.agency_detach")))).length).toBe(1);
    expect((await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, AG.orgId), eq(schema.auditLog.action, "agency.client_detach")))).length).toBe(1);
    // o editor da agência perdeu o acesso: a sessão volta para outra conta e o cliente não abre
    expect((await call(activeOrgRoute.POST, req("POST", "/api/me/active-org", { token: agencyEditor.token, body: { orgId: C.id } }))).status).toBe(403);
    expect((await listClients(AG.ctx)).clients.map((c) => c.id)).not.toContain(C.id);
  });

  it("o administrador do cliente também pode desligar a própria conta", async () => {
    const D = await createClientAccount(AG.ctx, { name: "Mercado Delta", storeName: "Delta" });
    const own = await addMember({ orgId: D.id } as TestOrg, "admin");
    await expect(detachClient(ctxIn(D.id, own.userId, "editor"))).rejects.toMatchObject({ code: "forbidden" });
    const r = await detachClient(own.ctx);
    expect(r.removedMembers).toBe(1);
    await expect(detachClient(own.ctx)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("aprovação externa por link", () => {
  let ctx: TenantCtx;
  let campaignId: string;
  let otherCampaignName: string;

  beforeAll(async () => {
    if (!clientA) {
      AG = await makeOrg({ plan: "redes" });
      await enableAgencyMode(AG.ctx);
      clientA = await createClientAccount(AG.ctx, { name: "Mercado Alfa", storeName: "Alfa Centro" });
    }
    ctx = ctxIn(clientA.id, AG.userId);
    const p = await makeProduct({ ctx } as TestOrg, { name: "Café Prévia 500g", costCents: 123 });
    const c = await createCampaign(ctx, { storeId: clientA.storeId, name: "Campanha Prévia", startsAt: days(0).toISOString(), endsAt: days(5).toISOString(), productIds: [p.id] });
    campaignId = c.campaign.id;
    otherCampaignName = "Campanha Escondida";
    const p2 = await makeProduct({ ctx } as TestOrg, { name: "Produto Escondido" });
    await createCampaign(ctx, { storeId: clientA.storeId, name: otherCampaignName, productIds: [p2.id] });
  });
  beforeEach(() => clearAllRateLimits());

  it("valida validade (1–30 dias) e PIN (4–6 dígitos); aprovador não cria", async () => {
    await expect(createPreviewLink(ctx, campaignId, { days: 0 })).rejects.toBeTruthy();
    await expect(createPreviewLink(ctx, campaignId, { days: 31 })).rejects.toBeTruthy();
    await expect(createPreviewLink(ctx, campaignId, { pin: "12" })).rejects.toBeTruthy();
    await expect(createPreviewLink(ctx, campaignId, { pin: "abcd" })).rejects.toBeTruthy();
    await expect(createPreviewLink({ ...ctx, role: "aprovador" }, campaignId, {})).rejects.toMatchObject({ code: "forbidden" });
    const l = await createPreviewLink(ctx, campaignId, {});
    expect(Math.round((new Date(l.expiresAt).getTime() - Date.now()) / 86400000)).toBe(7);
    // só o hash fica salvo
    const [row] = await db().select().from(schema.previewLinks).where(eq(schema.previewLinks.id, l.id));
    expect(row!.tokenHash).not.toContain(tokenOf(l.url));
    await revokePreviewLink(ctx, l.id);
  });

  it("outra conta não lista nem revoga links", async () => {
    const l = await createPreviewLink(ctx, campaignId, {});
    const other = await makeOrg();
    await expect(listPreviewLinks(other.ctx, campaignId)).rejects.toMatchObject({ code: "not_found" });
    await expect(revokePreviewLink(other.ctx, l.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await call(previewLinksRoute.GET, req("GET", `/api/preview-links?campaignId=${campaignId}`, { token: other.token }))).status).toBe(404);
    await revokePreviewLink(ctx, l.id);
  });

  it("expirado e revogado não abrem", async () => {
    const old = await createPreviewLink(ctx, campaignId, { days: 1 }, days(-3));
    expect((await getPublicPreview(tokenOf(old.url))).state).toBe("expired");
    const l = await createPreviewLink(ctx, campaignId, {});
    expect((await getPublicPreview(tokenOf(l.url))).state).toBe("ok");
    await revokePreviewLink(ctx, l.id);
    expect((await getPublicPreview(tokenOf(l.url))).state).toBe("revoked");
    await expect(decidePreview(tokenOf(l.url), null, { name: "Ana", decision: "aprovado" })).rejects.toMatchObject({ code: "not_found" });
    expect((await getPublicPreview("token-que-nao-existe-1234567890")).state).toBe("invalid");
  });

  it("PIN: exige o PIN, conta tentativas e bloqueia após o limite", async () => {
    const l = await createPreviewLink(ctx, campaignId, { pin: "4321" });
    const t = tokenOf(l.url);
    expect((await getPublicPreview(t)).state).toBe("pin_required");
    await expect(loadPreviewBundle(t, null)).rejects.toMatchObject({ code: "not_found" });
    await expect(decidePreview(t, null, { name: "Ana", decision: "aprovado" })).rejects.toMatchObject({ code: "forbidden" });
    // PIN certo via HTTP grava cookie que libera a página
    const ok = await call(pinRoute.POST, req("POST", `/api/public-preview/${t}/pin`, { body: { pin: "4321" } }), { token: t });
    expect(ok.status).toBe(200);
    const setCookie = ok.res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/ev_pv_.*HttpOnly/i);
    const cookieValue = decodeURIComponent(/ev_pv_[^=]+=([^;]+)/.exec(setCookie)![1]!);
    expect((await getPublicPreview(t, { cookie: cookieValue })).state).toBe("ok");
    // o cookie de um link não abre outro link com PIN
    const l2 = await createPreviewLink(ctx, campaignId, { pin: "9999" });
    const t2 = tokenOf(l2.url);
    expect((await getPublicPreview(t2, { cookie: cookieValue })).state).toBe("pin_required");
    // erros até o bloqueio
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) await expect(verifyPreviewPin(t2, { pin: "0000" })).rejects.toMatchObject({ code: "validation" });
    await expect(verifyPreviewPin(t2, { pin: "0000" })).rejects.toMatchObject({ code: "rate_limited" });
    // bloqueado mesmo com o PIN certo
    await expect(verifyPreviewPin(t2, { pin: "9999" })).rejects.toMatchObject({ code: "rate_limited" });
    expect((await getPublicPreview(t2)).state).toBe("locked");
    // tentativas registradas na auditoria da conta (sem o PIN)
    const fails = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, clientA.id), eq(schema.auditLog.action, "preview_link.pin_failed"), eq(schema.auditLog.entityId, l2.id)));
    expect(fails).toHaveLength(PIN_MAX_ATTEMPTS);
    expect(JSON.stringify(fails)).not.toContain("0000");
    // depois do bloqueio (15 min), volta a aceitar
    const later = new Date(Date.now() + 16 * 60 * 1000);
    expect((await getPublicPreview(t2, { now: later })).state).toBe("pin_required");
    await revokePreviewLink(ctx, l.id); await revokePreviewLink(ctx, l2.id);
  });

  it("página pública não vaza outros dados: só peças da versão, nome da loja e da campanha", async () => {
    const l = await createPreviewLink(ctx, campaignId, {});
    const t = tokenOf(l.url);
    const pv = await getPublicPreview(t, { countView: true });
    expect(pv).toMatchObject({ state: "ok", storeName: "Alfa Centro", campaignName: "Campanha Prévia" });
    expect(Object.keys(pv).sort()).toEqual(["campaignName", "decision", "expiresAt", "state", "storeName", "version"]);
    const bundle = await loadPreviewBundle(t, null);
    const s = JSON.stringify(bundle);
    expect(s).toContain("Café Prévia 500g");
    expect(s).not.toMatch(/costCents|cost_cents|Produto Escondido|Campanha Escondida|Arroz secreto|Feijão Beta/);
    expect(s).not.toContain(clientA.id); // nenhum id da conta
    expect(bundle.pieces.length).toBeGreaterThan(0);
    const [row] = await db().select().from(schema.previewLinks).where(eq(schema.previewLinks.id, l.id));
    expect(row!.viewCount).toBe(1);
    await revokePreviewLink(ctx, l.id);
  });

  it("registra a decisão (link + auditoria + e-mail) e não aceita uma segunda", async () => {
    const l = await createPreviewLink(ctx, campaignId, {});
    const t = tokenOf(l.url);
    // pedir alterações sem comentário é recusado
    const bad = await call(decisionRoute.POST, req("POST", `/api/public-preview/${t}/decision`, { body: { name: "Ana", decision: "alteracoes" } }), { token: t });
    expect(bad.status).toBe(422);
    const r = await call(decisionRoute.POST, req("POST", `/api/public-preview/${t}/decision`, { body: { name: "Ana Cliente", decision: "alteracoes", comment: "O café é R$ 18,90." } }), { token: t });
    expect(r.status).toBe(200);
    const [row] = await db().select().from(schema.previewLinks).where(eq(schema.previewLinks.id, l.id));
    expect(row).toMatchObject({ decision: "alteracoes", decidedName: "Ana Cliente", comment: "O café é R$ 18,90." });
    const [audit] = await db().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, clientA.id), eq(schema.auditLog.action, "campaign.external_decision"), eq(schema.auditLog.entityId, campaignId)));
    expect(audit!.summary).toContain("Ana Cliente");
    const mails = await db().select().from(schema.emailOutbox).where(and(eq(schema.emailOutbox.orgId, clientA.id), eq(schema.emailOutbox.kind, "preview_decision")));
    expect(mails.length).toBeGreaterThan(0);
    const again = await call(decisionRoute.POST, req("POST", `/api/public-preview/${t}/decision`, { body: { name: "Outro", decision: "aprovado" } }), { token: t });
    expect(again.status).toBe(409);
    // a equipe vê a decisão na lista; a campanha continua no fluxo interno (não foi aprovada)
    const list = await listPreviewLinks(ctx, campaignId);
    expect(list.currentDecision).toMatchObject({ decision: "alteracoes", decidedName: "Ana Cliente" });
    const [c] = await db().select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    expect(c!.status).toBe("rascunho");
    expect(c!.approvedVersion).toBeNull();
    const pv = await getPublicPreview(t);
    expect(pv).toMatchObject({ state: "ok", decision: { decision: "alteracoes", name: "Ana Cliente" } });
  });

  it("campanha alterada depois do link: prévia desatualizada e sem decisão", async () => {
    const l = await createPreviewLink(ctx, campaignId, {});
    const t = tokenOf(l.url);
    const [c] = await db().select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    await saveCampaign(ctx, campaignId, { baseVersion: c!.version, campaign: { name: "Campanha Prévia (ajustada)" } });
    const pv = await getPublicPreview(t);
    expect(pv.state).toBe("outdated");
    await expect(decidePreview(t, null, { name: "Ana", decision: "aprovado" })).rejects.toMatchObject({ code: "conflict" });
    const list = await listPreviewLinks(ctx, campaignId);
    expect(list.links.find((x) => x.id === l.id)!.status).toBe("desatualizado");
  });
});
