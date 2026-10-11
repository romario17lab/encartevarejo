import { describe, expect, it, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createCampaign, getEditorState, saveCampaign, duplicateCampaign, branchPreview, listVersions, restoreVersion, switchTemplate, listCampaigns } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { getStorefront } from "@/server/services/storefront";
import { upsertStorePrices } from "@/server/services/products";
import { createStore } from "@/server/services/stores";
import * as campaignRoute from "@/app/api/campaigns/[id]/route";
import { call, days, makeOrg, makeProduct, req, templateId, type TestOrg } from "./helpers";

async function setup() {
  const org = await makeOrg({ plan: "profissional" });
  const p1 = await makeProduct(org, { name: "Arroz tipo 1 5kg", unit: "pct", regularCents: 2990, promoCents: 2490 });
  const p2 = await makeProduct(org, { name: "Feijão 1kg", unit: "pct", regularCents: 899, promoCents: null });
  const state = await createCampaign(org.ctx, {
    storeId: org.storeId, name: "Semana", templateId: templateId(), startsAt: days(-1).toISOString(), endsAt: days(6).toISOString(), productIds: [p1.id, p2.id],
  });
  return { org, p1, p2, state };
}

const slugOf = async (org: TestOrg) => (await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId)))[0]!.slug;

describe("campanhas", () => {
  beforeAll(async () => { await makeOrg(); });

  it("criação tira um retrato dos produtos e fixa o modelo", async () => {
    const { org, state, p1 } = await setup();
    expect(state.campaign.version).toBe(1);
    expect(state.campaign.status).toBe("rascunho");
    expect(state.template.id).toBe(templateId());
    expect(state.items).toHaveLength(2);
    const arroz = state.items.find((i) => i.productId === p1.id)!;
    expect(arroz.offer.mode).toBe("from_to");
    expect(arroz.offer.priceCents).toBe(2490);
    expect(arroz.offer.regularCents).toBe(2990);
    const feijao = state.items.find((i) => i.name === "Feijão 1kg")!;
    expect(feijao.offer.mode).toBe("simple");
    expect(feijao.offer.priceCents).toBe(899);
    expect(JSON.stringify(state)).not.toMatch(/costCents/);
    const versions = await listVersions(org.ctx, state.campaign.id);
    expect(versions.map((v) => [v.version, v.reason])).toEqual([[1, "criação"]]);
  });

  it("salvar incrementa a versão; sem mudança não cria versão; baseVersion antiga → 409", async () => {
    const { org, state } = await setup();
    const id = state.campaign.id;
    const s2 = await saveCampaign(org.ctx, id, { baseVersion: 1, campaign: { title: "Fim de semana" } });
    expect(s2.campaign.version).toBe(2);
    expect(s2.saved).toBe(true);
    const same = await saveCampaign(org.ctx, id, { baseVersion: 2, campaign: { title: "Fim de semana" } });
    expect(same.campaign.version).toBe(2);
    expect(same.saved).toBe(false);
    await expect(saveCampaign(org.ctx, id, { baseVersion: 1, campaign: { title: "Outro" } })).rejects.toMatchObject({
      code: "conflict", message: "Esta campanha foi alterada em outro lugar. Recarregue para ver a versão mais recente.",
    });
    // pela rota HTTP
    const r = await call(campaignRoute.PUT, req("PUT", `/api/campaigns/${id}`, { token: org.token, body: { baseVersion: 1, campaign: { title: "X" } } }), { id });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("conflict");
    expect((await listVersions(org.ctx, id)).map((v) => v.version)).toEqual([2, 1]);
  });

  it("itens novos, edição sem alterar o catálogo, e atualização explícita do catálogo", async () => {
    const { org, state, p1 } = await setup();
    const items = state.items.map((i) => (i.productId === p1.id ? { ...i, name: "Arroz especial 5kg" } : i));
    items.push({ ...state.items[0]!, id: undefined as unknown as string, productId: null, name: "Item avulso", offer: { ...state.items[0]!.offer, mode: "simple", regularCents: null, priceCents: 500 } });
    const s = await saveCampaign(org.ctx, state.campaign.id, { baseVersion: 1, items });
    expect(s.items).toHaveLength(3);
    expect(s.items.map((i) => i.name)).toContain("Item avulso");
    const [prod] = await getDb().select().from(schema.products).where(eq(schema.products.id, p1.id));
    expect(prod!.name).toBe("Arroz tipo 1 5kg"); // catálogo intacto
    const items2 = s.items.map((i) => (i.productId === p1.id ? { ...i, updateCatalog: true } : i));
    await saveCampaign(org.ctx, state.campaign.id, { baseVersion: s.campaign.version, items: items2 });
    const [prod2] = await getDb().select().from(schema.products).where(eq(schema.products.id, p1.id));
    expect(prod2!.name).toBe("Arroz especial 5kg");
  });

  it("avisos: datas inválidas e validação das ofertas", async () => {
    const { org, state } = await setup();
    const items = state.items.map((i, idx) => (idx === 0 ? { ...i, unit: null, offer: { ...i.offer, mode: "simple", priceCents: 0 } } : i));
    const s = await saveCampaign(org.ctx, state.campaign.id, { baseVersion: 1, campaign: { startsAt: days(3).toISOString(), endsAt: days(1).toISOString() }, items });
    const msgs = s.issues.map((i) => i.message).join(" | ");
    expect(msgs).toMatch(/data final precisa ser depois/);
    expect(msgs).toMatch(/Informe a unidade/);
    expect(msgs).toMatch(/não pode ser zero/);
    const s2 = await saveCampaign(org.ctx, state.campaign.id, { baseVersion: s.campaign.version, campaign: { startsAt: days(-5).toISOString(), endsAt: days(-1).toISOString() } });
    expect(s2.issues.some((i) => /já terminou/.test(i.message))).toBe(true);
    await expect(transitionCampaign(org.ctx, state.campaign.id, "submit")).rejects.toMatchObject({ code: "validation" });
  });

  it("mudança de preço após aprovação exige nova aprovação; vitrine mantém a versão publicada", async () => {
    const { org, state } = await setup();
    const id = state.campaign.id;
    await transitionCampaign(org.ctx, id, "submit");
    await transitionCampaign(org.ctx, id, "approve");
    const pub = await transitionCampaign(org.ctx, id, "publish");
    expect(pub.campaign.status).toBe("publicada");
    expect(pub.campaign.publishedVersion).toBe(1);
    const slug = await slugOf(org);
    let sf = await getStorefront(slug);
    expect(sf!.campaigns).toHaveLength(1);
    expect(sf!.campaigns[0]!.items.map((i) => i.offer.priceCents).sort((a, b) => a! - b!)).toEqual([899, 2490]);
    expect(JSON.stringify(sf)).not.toMatch(/cost/i);

    // mudar só a ordem e o título não muda o hash: segue publicada
    const reordered = [...pub.items].reverse();
    const s1 = await saveCampaign(org.ctx, id, { baseVersion: pub.campaign.version, items: reordered, campaign: { title: "Novo título" } });
    expect(s1.campaign.status).toBe("publicada");
    expect(s1.campaign.contentHash).toBe(pub.campaign.contentHash);

    // mudar preço: volta a rascunho, aprovação limpa, vitrine continua com o preço antigo
    const changed = s1.items.map((i) => (i.name === "Feijão 1kg" ? { ...i, offer: { ...i.offer, priceCents: 799 } } : i));
    const s2 = await saveCampaign(org.ctx, id, { baseVersion: s1.campaign.version, items: changed });
    expect(s2.campaign.status).toBe("rascunho");
    expect(s2.campaign.approvedHash).toBeNull();
    expect(s2.campaign.publishedVersion).toBe(1);
    expect(s2.campaign.contentHash).not.toBe(pub.campaign.contentHash);
    sf = await getStorefront(slug);
    expect(sf!.campaigns[0]!.items.find((i) => i.name === "Feijão 1kg")!.offer.priceCents).toBe(899);
    await expect(transitionCampaign(org.ctx, id, "publish")).rejects.toMatchObject({ code: "conflict" });
    const audit = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, id), eq(schema.auditLog.action, "campaign.update")));
    expect(audit.some((a) => /precisa de nova aprovação/.test(a.summary))).toBe(true);

    // nova aprovação + publicação → vitrine atualiza
    await transitionCampaign(org.ctx, id, "approve");
    const pub2 = await transitionCampaign(org.ctx, id, "publish");
    expect(pub2.campaign.publishedVersion).toBe(s2.campaign.version);
    sf = await getStorefront(slug);
    expect(sf!.campaigns[0]!.items.find((i) => i.name === "Feijão 1kg")!.offer.priceCents).toBe(799);
    expect(sf!.campaigns[0]!.title).toBe("Novo título");

    // "acabou": pausar item some da vitrine sem nova aprovação
    const paused = pub2.items.map((i) => (i.name === "Feijão 1kg" ? { ...i, paused: true } : i));
    const s3 = await saveCampaign(org.ctx, id, { baseVersion: pub2.campaign.version, items: paused });
    expect(s3.campaign.status).toBe("publicada");
    sf = await getStorefront(slug);
    expect(sf!.campaigns[0]!.items.map((i) => i.name)).toEqual(["Arroz tipo 1 5kg"]);

    // retirar da vitrine e encerrar
    await transitionCampaign(org.ctx, id, "unpublish");
    expect((await getStorefront(slug))!.campaigns).toHaveLength(0);
  });

  it("D-02: editor e lista sinalizam nova aprovação enquanto a vitrine mostra a versão publicada", async () => {
    const { org, state } = await setup();
    const id = state.campaign.id;
    expect(state.campaign.needsReapproval).toBe(false);
    await transitionCampaign(org.ctx, id, "approve");
    const pub = await transitionCampaign(org.ctx, id, "publish");
    expect((await getEditorState(org.ctx, id)).campaign.needsReapproval).toBe(false);
    // edição que não muda o hash: sem aviso
    const s1 = await saveCampaign(org.ctx, id, { baseVersion: pub.campaign.version, campaign: { title: "Outro título" } });
    expect(s1.campaign.needsReapproval).toBe(false);
    // mudança de preço: aviso aparece já na resposta do salvamento (é o que o editor usa)
    const changed = s1.items.map((i) => (i.name === "Feijão 1kg" ? { ...i, offer: { ...i.offer, priceCents: 799 } } : i));
    const s2 = await saveCampaign(org.ctx, id, { baseVersion: s1.campaign.version, items: changed });
    expect(s2.campaign.status).toBe("rascunho");
    expect(s2.campaign.approvedHash).toBeNull();
    expect(s2.campaign.needsReapproval).toBe(true);
    expect(s2.campaign.publishedVersion).toBe(1);
    expect((await listCampaigns(org.ctx, {})).find((c) => c.id === id)!.needsReapproval).toBe(true);
    // continua valendo em revisão; some ao aprovar de novo
    await transitionCampaign(org.ctx, id, "submit");
    expect((await getEditorState(org.ctx, id)).campaign.needsReapproval).toBe(true);
    await transitionCampaign(org.ctx, id, "approve");
    expect((await getEditorState(org.ctx, id)).campaign.needsReapproval).toBe(false);
    await transitionCampaign(org.ctx, id, "publish");
    expect((await getEditorState(org.ctx, id)).campaign.needsReapproval).toBe(false);
    // retirada da vitrine: nada publicado, sem aviso
    await transitionCampaign(org.ctx, id, "unpublish");
    expect((await getEditorState(org.ctx, id)).campaign.needsReapproval).toBe(false);
  });

  it("vitrine respeita as datas do instantâneo publicado", async () => {
    const org = await makeOrg();
    const p = await makeProduct(org);
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Futura", startsAt: days(2).toISOString(), endsAt: days(5).toISOString(), productIds: [p.id] });
    await transitionCampaign(org.ctx, st.campaign.id, "approve");
    await transitionCampaign(org.ctx, st.campaign.id, "publish");
    const slug = await slugOf(org);
    expect((await getStorefront(slug))!.campaigns).toHaveLength(0);
    expect((await getStorefront(slug, days(3)))!.campaigns).toHaveLength(1);
    expect(await getStorefront("nao-existe-essa-loja")).toBeNull();
  });

  it("versões: restaurar cria nova versão a partir do instantâneo", async () => {
    const { org, state } = await setup();
    const id = state.campaign.id;
    const s2 = await saveCampaign(org.ctx, id, { baseVersion: 1, items: state.items.slice(0, 1) });
    expect(s2.items).toHaveLength(1);
    const r = await restoreVersion(org.ctx, id, 1);
    expect(r.campaign.version).toBe(3);
    expect(r.items).toHaveLength(2);
    expect(r.campaign.contentHash).toBe(state.campaign.contentHash);
    const vs = await listVersions(org.ctx, id);
    expect(vs[0]!.reason).toBe("restaurado da versão 1");
  });

  it("troca de modelo mantém itens e personalizações", async () => {
    const { org, state } = await setup();
    const s = await saveCampaign(org.ctx, state.campaign.id, { baseVersion: 1, campaign: { overrides: { title: "Personalizado" } } });
    const r = await switchTemplate(org.ctx, state.campaign.id, { templateId: templateId() });
    expect(r.items).toHaveLength(2);
    expect(r.campaign.overrides).toEqual({ title: "Personalizado" });
    expect(r.campaign.contentHash).toBe(s.campaign.contentHash);
    await expect(switchTemplate(org.ctx, state.campaign.id, { templateId: "nao-existe" })).rejects.toMatchObject({ code: "validation" });
  });

  it("duplicar para filiais usa o preço da filial e mostra a prévia das diferenças", async () => {
    const { org, state, p1 } = await setup();
    const branch = await createStore(org.ctx, { name: "Filial Norte" });
    await upsertStorePrices(org.ctx, branch.id, { prices: [{ productId: p1.id, regularCents: 3190, promoCents: 2690 }] });
    const prev = await branchPreview(org.ctx, state.campaign.id, [branch.id]);
    expect(prev.stores[0]!.differences).toHaveLength(1);
    expect(prev.stores[0]!.differences[0]).toMatchObject({ currentPriceCents: 2490, newPriceCents: 2690, source: "preco_da_loja" });
    const dup = await duplicateCampaign(org.ctx, state.campaign.id, { storeIds: [branch.id] });
    expect(dup.campaigns).toHaveLength(1);
    const copy = await getEditorState(org.ctx, dup.campaigns[0]!.id);
    expect(copy.campaign.parentCampaignId).toBe(state.campaign.id);
    expect(copy.campaign.status).toBe("rascunho");
    expect(copy.campaign.storeId).toBe(branch.id);
    expect(copy.items.find((i) => i.productId === p1.id)!.offer.priceCents).toBe(2690);
    // mesma loja: cópia idêntica
    const same = await duplicateCampaign(org.ctx, state.campaign.id, {});
    const sameState = await getEditorState(org.ctx, same.campaigns[0]!.id);
    expect(sameState.campaign.contentHash).toBe(state.campaign.contentHash);
    const list = await listCampaigns(org.ctx, { storeId: branch.id });
    expect(list.map((c) => c.id)).toEqual([dup.campaigns[0]!.id]);
  });

  it("filtro de calendário por intervalo de datas", async () => {
    const { org, state } = await setup();
    expect((await listCampaigns(org.ctx, { from: days(10).toISOString(), to: days(20).toISOString() })).length).toBe(0);
    expect((await listCampaigns(org.ctx, { from: days(0).toISOString(), to: days(2).toISOString() })).map((c) => c.id)).toContain(state.campaign.id);
    expect((await listCampaigns(org.ctx, { status: "publicada" })).length).toBe(0);
  });
});
