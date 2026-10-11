import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createCampaign, getEditorState } from "@/server/services/campaigns";
import { listStorePrices, upsertStorePrices } from "@/server/services/products";
import {
  branchCopyPreview, createStore, duplicateToBranches, getStore, insertStore, listStores, storeInputSchema, storesOverview, updateStore,
} from "@/server/services/stores";
import { createInvitation, listInvitations, lookupInvitation, removeMember, resendInvitation, revokeInvitation, updateMember } from "@/server/services/members";
import { listHistory } from "@/server/services/history";
import * as memberRoute from "@/app/api/members/[userId]/route";
import * as storeRoute from "@/app/api/stores/[id]/route";
import * as branchCopyRoute from "@/app/api/stores/branch-copy/route";
import * as auditRoute from "@/app/api/audit/route";
import * as resendRoute from "@/app/api/invitations/[id]/resend/route";
import { addMember, call, days, makeOrg, makeProduct, req, uid, type TestOrg } from "./helpers";

/** Conta de rede (plano Redes) com a loja do cadastro (A) e uma filial B com endereço diferente. */
async function chain(plan = "redes") {
  const org = await makeOrg({ plan });
  await updateStore(org.ctx, org.storeId, { address: { street: "Rua Um", number: "10", city: "Campinas", state: "SP" }, phone: "(19) 3333-0000" });
  const b = await createStore(org.ctx, { name: `Filial B ${uid()}`, address: { street: "Av. Dois", number: "200", city: "Sorocaba", state: "SP" }, phone: "(15) 3222-1111" });
  return { org, a: org.storeId, b: b.id };
}

async function campaignIn(org: TestOrg, storeId: string, productIds: string[]) {
  const st = await createCampaign(org.ctx, { storeId, name: `Ofertas ${uid()}`, startsAt: days(0).toISOString(), endsAt: days(6).toISOString(), productIds });
  return st.campaign.id;
}

describe("acesso por loja (membro limitado a filiais)", () => {
  it("membro limitado à loja A não lê dados, preços, campanhas nem histórico da loja B", async () => {
    const { org, a, b } = await chain();
    const p = await makeProduct(org);
    await upsertStorePrices(org.ctx, b, { prices: [{ productId: p.id, regularCents: 1199, promoCents: null }] });
    const campB = await campaignIn(org, b, [p.id]);
    const editor = await addMember(org, "editor", [a]);
    const aprovador = await addMember(org, "aprovador", [a]);

    expect((await listStores(editor.ctx)).map((s) => s.id)).toEqual([a]);
    await expect(getStore(editor.ctx, b)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listStorePrices(editor.ctx, b)).rejects.toMatchObject({ code: "forbidden" });
    await expect(upsertStorePrices(editor.ctx, b, { prices: [{ productId: p.id, regularCents: 1, promoCents: null }] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(getEditorState(editor.ctx, campB)).rejects.toMatchObject({ code: "forbidden" });
    const r = await call(storeRoute.GET, req("GET", `/api/stores/${b}`, { token: editor.token }), { id: b });
    expect(r.status).toBe(403);

    // cópia para a filial B também é recusada para quem não tem acesso a ela
    const campA = await campaignIn(org, a, [p.id]);
    await expect(branchCopyPreview(editor.ctx, campA, [b])).rejects.toMatchObject({ code: "forbidden" });
    await expect(duplicateToBranches(editor.ctx, campA, { storeIds: [b] })).rejects.toMatchObject({ code: "forbidden" });

    // histórico: o aprovador da loja A não vê a criação da filial B nem a campanha de B
    const h = await listHistory(aprovador.ctx, { limit: 200 });
    expect(h.entries.length).toBeGreaterThan(0);
    expect(h.entries.every((e) => e.storeId === a)).toBe(true);
    expect(h.entries.some((e) => e.entityId === campB || e.entityId === b)).toBe(false);
    await expect(listHistory(aprovador.ctx, { storeId: b })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("administrador define as lojas de acesso; lojas de outra conta são recusadas", async () => {
    const { org, a, b } = await chain();
    const other = await makeOrg();
    const ed = await addMember(org, "editor");
    await updateMember(org.ctx, ed.userId, { storeIds: [b] });
    const [m] = await getDb().select().from(schema.memberships).where(eq(schema.memberships.userId, ed.userId));
    expect(m!.storeIds).toEqual([b]);
    await expect(updateMember(org.ctx, ed.userId, { storeIds: [other.storeId] })).rejects.toMatchObject({ code: "validation" });
    await updateMember(org.ctx, ed.userId, { storeIds: null });
    const [m2] = await getDb().select().from(schema.memberships).where(eq(schema.memberships.userId, ed.userId));
    expect(m2!.storeIds).toBeNull();
    const h = await listHistory(org.ctx, { type: "equipe" });
    expect(h.entries[0]!.summary).toMatch(/todas as lojas/);
    expect(h.entries[1]!.summary).toMatch(/limitado a/);
    void a;
  });
});

describe("papéis e administradores", () => {
  it("somente administrador altera papéis e remove membros (serviço e rota)", async () => {
    const org = await makeOrg();
    const editor = await addMember(org, "editor");
    const aprovador = await addMember(org, "aprovador");
    await expect(updateMember(editor.ctx, aprovador.userId, { role: "admin" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateMember(aprovador.ctx, editor.userId, { role: "admin" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateMember(editor.ctx, editor.userId, { role: "admin" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(aprovador.ctx, editor.userId)).rejects.toMatchObject({ code: "forbidden" });
    const r = await call(memberRoute.PATCH, req("PATCH", `/api/members/${aprovador.userId}`, { token: editor.token, body: { role: "admin" } }), { userId: aprovador.userId });
    expect(r.status).toBe(403);
    const ok = await call(memberRoute.PATCH, req("PATCH", `/api/members/${editor.userId}`, { token: org.token, body: { role: "aprovador" } }), { userId: editor.userId });
    expect(ok.status).toBe(200);
    const h = await listHistory(org.ctx, { type: "equipe" });
    expect(h.entries[0]!.summary).toMatch(/de Editor para Aprovador/);
  });

  it("o último administrador não pode ser rebaixado nem removido", async () => {
    const org = await makeOrg();
    await expect(updateMember(org.ctx, org.userId, { role: "editor" })).rejects.toMatchObject({ code: "validation", message: expect.stringMatching(/pelo menos um administrador/) });
    await expect(removeMember(org.ctx, org.userId)).rejects.toMatchObject({ code: "validation" });
    const del = await call(memberRoute.DELETE, req("DELETE", `/api/members/${org.userId}`, { token: org.token }), { userId: org.userId });
    expect(del.status).toBe(422);
  });

  it("a conta mantém ao menos um administrador com acesso a todas as lojas", async () => {
    const { org, a } = await chain();
    const admin2 = await addMember(org, "admin", [a]);
    // único admin com acesso total não pode ser limitado, rebaixado nem removido
    await expect(updateMember(org.ctx, org.userId, { storeIds: [a] })).rejects.toMatchObject({ message: expect.stringMatching(/todas as lojas/) });
    await expect(updateMember(admin2.ctx, org.userId, { role: "editor" })).rejects.toMatchObject({ message: expect.stringMatching(/todas as lojas/) });
    await expect(removeMember(admin2.ctx, org.userId)).rejects.toMatchObject({ message: expect.stringMatching(/todas as lojas/) });
    // liberando o segundo admin para todas as lojas, o primeiro pode ser rebaixado
    await updateMember(org.ctx, admin2.userId, { storeIds: null });
    await updateMember(org.ctx, org.userId, { role: "editor" });
    const [m] = await getDb().select().from(schema.memberships).where(eq(schema.memberships.userId, org.userId));
    expect(m!.role).toBe("editor");
  });
});

describe("convites", () => {
  it("reenviar gera novo link, invalida o anterior e renova a validade; cancelado não reenvia", async () => {
    const org = await makeOrg({ plan: "profissional" });
    const inv = await createInvitation(org.ctx, { email: `conv-${uid()}@teste.com`, role: "editor" });
    const oldToken = new URL(inv.acceptUrl!).searchParams.get("token")!;
    await getDb().update(schema.invitations).set({ expiresAt: days(-1) }).where(eq(schema.invitations.id, inv.id));
    expect((await listInvitations(org.ctx)).find((i) => i.id === inv.id)!.status).toBe("expirado");
    const r = await call(resendRoute.POST, req("POST", `/api/invitations/${inv.id}/resend`, { token: org.token }), { id: inv.id });
    expect(r.status).toBe(200);
    const newToken = new URL(r.json.acceptUrl).searchParams.get("token")!;
    expect(newToken).not.toBe(oldToken);
    await expect(lookupInvitation(oldToken)).rejects.toMatchObject({ code: "not_found" });
    expect((await lookupInvitation(newToken)).email).toBe(inv.email);
    expect((await listInvitations(org.ctx)).find((i) => i.id === inv.id)!.status).toBe("pendente");
    const editor = await addMember(org, "editor");
    await expect(resendInvitation(editor.ctx, inv.id)).rejects.toMatchObject({ code: "forbidden" });
    await revokeInvitation(org.ctx, inv.id);
    await expect(resendInvitation(org.ctx, inv.id)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("filiais: prévia e duplicação", () => {
  it("a prévia mostra preços diferentes, sinaliza itens sem preço e as diferenças de endereço/contatos", async () => {
    const { org, a, b } = await chain();
    const comPrecoFilial = await makeProduct(org, { name: "Arroz demonstração", regularCents: 2990, promoCents: 2490 });
    const semPreco = await makeProduct(org, { name: "Produto sem preço (demo)", regularCents: null, promoCents: null });
    const deCatalogo = await makeProduct(org, { name: "Feijão demonstração", regularCents: 899, promoCents: null });
    const deporSemPromo = await makeProduct(org, { name: "Café demonstração", regularCents: 2290, promoCents: 1990 });
    await upsertStorePrices(org.ctx, b, { prices: [
      { productId: comPrecoFilial.id, regularCents: 3190, promoCents: 2690 },
      { productId: deporSemPromo.id, regularCents: 2390, promoCents: null },
    ] });
    // na loja A o arroz tem preço próprio; na B terá outro
    await upsertStorePrices(org.ctx, a, { prices: [{ productId: comPrecoFilial.id, regularCents: 2990, promoCents: 2390 }] });
    const id = await campaignIn(org, a, [comPrecoFilial.id, semPreco.id, deCatalogo.id, deporSemPromo.id]);

    const r = await call(branchCopyRoute.GET, req("GET", `/api/stores/branch-copy?campaignId=${id}&storeIds=${b}`, { token: org.token }));
    expect(r.status).toBe(200);
    const sb = r.json.stores[0];
    expect(sb.storeId).toBe(b);
    expect(sb.sameStore).toBe(false);
    const arroz = sb.differences.find((d: { name: string }) => d.name === "Arroz demonstração");
    expect(arroz).toMatchObject({ currentPriceCents: 2390, newPriceCents: 2690, newRegularCents: 3190, source: "preco_da_loja" });
    const reasons = Object.fromEntries(sb.attention.map((x: { name: string; reason: string }) => [x.name, x.reason]));
    expect(reasons["Produto sem preço (demo)"]).toBe("sem_preco");
    expect(reasons["Café demonstração"]).toBe("promocao_sem_preco_na_filial");
    expect(reasons["Feijão demonstração"]).toBeUndefined();
    expect(sb.usesCatalogCount).toBe(1);
    expect(sb.usesStorePriceCount).toBe(1);
    const fields = sb.contactChanges.map((c: { field: string }) => c.field);
    expect(fields).toEqual(expect.arrayContaining(["endereço", "telefone"]));
    expect(sb.contactChanges.find((c: { field: string }) => c.field === "endereço").to).toMatch(/Sorocaba/);
    expect(sb.sameBrandKit).toBe(true);

    // duplicação: cópias em rascunho com o preço da filial; nada inventado para o item sem preço
    const dup = await call(branchCopyRoute.POST, req("POST", "/api/stores/branch-copy", { token: org.token, body: { campaignId: id, storeIds: [b] } }));
    expect(dup.status).toBe(201);
    const copy = await getEditorState(org.ctx, dup.json.campaigns[0].id);
    expect(copy.campaign.status).toBe("rascunho");
    expect(copy.campaign.storeId).toBe(b);
    const byName = Object.fromEntries(copy.items.map((i) => [i.name, i.offer]));
    expect(byName["Arroz demonstração"]!.priceCents).toBe(2690);
    expect(byName["Produto sem preço (demo)"]!.priceCents).toBeNull();
  });

  it("plano sem o recurso de filiais recusa a cópia para outra loja com mensagem clara", async () => {
    const org = await makeOrg(); // plano inicial: sem "filiais"
    const db = getDb();
    const b = await insertStore(org.orgId, storeInputSchema.parse({ name: `Filial ${uid()}` }), db);
    const p = await makeProduct(org);
    const id = await campaignIn(org, org.storeId, [p.id]);
    await expect(branchCopyPreview(org.ctx, id, [b.id])).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/plano/) });
    const r = await call(branchCopyRoute.POST, req("POST", "/api/stores/branch-copy", { token: org.token, body: { campaignId: id, storeIds: [b.id] } }));
    expect(r.status).toBe(402);
    expect(r.json.error.message).toMatch(/plano/i);
    // cópia na própria loja continua permitida
    const same = await duplicateToBranches(org.ctx, id, { storeIds: [org.storeId] });
    expect(same.campaigns).toHaveLength(1);
  });

  it("limite de lojas do plano e visão geral das filiais", async () => {
    const org = await makeOrg({ plan: "profissional" }); // 3 lojas
    await createStore(org.ctx, { name: `Filial 2 ${uid()}` });
    const ov = await storesOverview(org.ctx);
    expect(ov.plan).toMatchObject({ storeLimit: 3, storesUsed: 2, branchesFeature: true });
    expect(ov.stores[0]!.brandKitName).toBeTruthy();
    expect(ov.brandKits[0]!.storeCount).toBe(2);
    await createStore(org.ctx, { name: `Filial 3 ${uid()}` });
    await expect(createStore(org.ctx, { name: `Filial 4 ${uid()}` })).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/até 3 lojas/) });
  });
});

describe("isolamento entre contas", () => {
  it("uma conta não vê nem altera filiais, membros, convites, campanhas ou histórico de outra", async () => {
    const x = await chain();
    const y = await chain();
    const py = await makeProduct(y.org);
    const campY = await campaignIn(y.org, y.a, [py.id]);
    const invY = await createInvitation(y.org.ctx, { email: `y-${uid()}@teste.com`, role: "editor" });

    await expect(branchCopyPreview(x.org.ctx, campY, [x.b])).rejects.toMatchObject({ code: "not_found" });
    await expect(duplicateToBranches(x.org.ctx, campY, { storeIds: [x.b] })).rejects.toMatchObject({ code: "not_found" });
    const px = await makeProduct(x.org);
    const campX = await campaignIn(x.org, x.a, [px.id]);
    await expect(branchCopyPreview(x.org.ctx, campX, [y.b])).rejects.toMatchObject({ code: "not_found" });
    await expect(updateMember(x.org.ctx, y.org.userId, { role: "editor" })).rejects.toMatchObject({ code: "not_found" });
    await expect(removeMember(x.org.ctx, y.org.userId)).rejects.toMatchObject({ code: "not_found" });
    await expect(resendInvitation(x.org.ctx, invY.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(listHistory(x.org.ctx, { storeId: y.b })).rejects.toMatchObject({ code: "not_found" });
    const hx = await call(auditRoute.GET, req("GET", `/api/audit?entityType=campaign&entityId=${campY}`, { token: x.org.token }));
    expect(hx.status).toBe(200);
    expect(hx.json.entries).toEqual([]);
    const all = await listHistory(x.org.ctx, { limit: 200 });
    expect(all.entries.every((e) => e.orgId === x.org.orgId)).toBe(true);
    expect(all.entries.some((e) => e.entityId === campY || e.entityId === y.b || e.entityId === invY.id)).toBe(false);
    expect((await storesOverview(x.org.ctx)).stores.map((s) => s.id).sort()).toEqual([x.a, x.b].sort());
  });
});

describe("histórico", () => {
  it("filtra por tipo e loja, pagina e é restrito a quem pode ler o registro", async () => {
    const { org, a, b } = await chain();
    const p = await makeProduct(org);
    await campaignIn(org, a, [p.id]);
    const campB = await campaignIn(org, b, [p.id]);
    await upsertStorePrices(org.ctx, b, { prices: [{ productId: p.id, regularCents: 1500, promoCents: null }] });

    const camps = await listHistory(org.ctx, { type: "campanhas" });
    expect(camps.entries.length).toBe(2);
    expect(camps.entries.every((e) => e.action.startsWith("campaign."))).toBe(true);

    const ofB = await listHistory(org.ctx, { storeId: b });
    expect(ofB.entries.map((e) => e.action).sort()).toEqual(["campaign.create", "store.create", "store_price.update"]);
    expect(ofB.entries.find((e) => e.entityId === campB)!.storeName).toMatch(/Filial B/);

    const p1 = await listHistory(org.ctx, { limit: 2 });
    expect(p1.entries).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await listHistory(org.ctx, { limit: 2, cursor: p1.nextCursor });
    expect(p2.entries[0]!.id).toBeLessThan(p1.entries[1]!.id);

    await expect(listHistory(org.ctx, { type: "inexistente" })).rejects.toMatchObject({ code: "validation" });
    const editor = await addMember(org, "editor");
    await expect(listHistory(editor.ctx, {})).rejects.toMatchObject({ code: "forbidden" });
    const r = await call(auditRoute.GET, req("GET", "/api/audit?tipo=equipe", { token: editor.token }));
    expect(r.status).toBe(403);
  });
});
