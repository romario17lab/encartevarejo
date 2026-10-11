import { describe, expect, it, beforeAll } from "vitest";
import sharp from "sharp";
import { getDb, schema } from "@/server/db";
import { newId } from "@/server/ids";
import { getProduct, updateProduct, archiveProduct, listProducts } from "@/server/services/products";
import { createCampaign, getEditorState, saveCampaign, listCampaigns } from "@/server/services/campaigns";
import { uploadImage, readAsset } from "@/server/services/assets";
import { listMembers, updateMember, removeMember } from "@/server/services/members";
import { getStore, updateStore } from "@/server/services/stores";
import { createStore } from "@/server/services/stores";
import { signedAssetUrl } from "@/server/assets";
import * as productRoute from "@/app/api/products/[id]/route";
import * as productsRoute from "@/app/api/products/route";
import * as campaignRoute from "@/app/api/campaigns/[id]/route";
import * as assetRoute from "@/app/api/assets/[id]/route";
import * as membersRoute from "@/app/api/members/[userId]/route";
import * as exportsRoute from "@/app/api/exports/route";
import { addMember, call, days, makeOrg, makeProduct, req, type TestOrg } from "./helpers";

let A: TestOrg, B: TestOrg;
let bProduct: Awaited<ReturnType<typeof makeProduct>>;
let bCampaignId: string;
let bAssetId: string;

describe("isolamento entre contas", () => {
  beforeAll(async () => {
    A = await makeOrg(); B = await makeOrg();
    bProduct = await makeProduct(B, { name: "Produto secreto B", costCents: 100 });
    bCampaignId = (await createCampaign(B.ctx, { storeId: B.storeId, name: "Campanha B", startsAt: days(0).toISOString(), endsAt: days(3).toISOString(), productIds: [bProduct.id] })).campaign.id;
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#ff0000" } }).png().toBuffer();
    bAssetId = (await uploadImage(B.ctx, { data: png })).id;
    await getDb().insert(schema.exportJobs).values({ id: newId("exp"), orgId: B.orgId, campaignId: bCampaignId, campaignVersion: 1, request: { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] }, createdBy: B.userId });
  });

  it("produtos: serviços não enxergam outra conta", async () => {
    await expect(getProduct(A.ctx, bProduct.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateProduct(A.ctx, bProduct.id, { name: "Hack" })).rejects.toMatchObject({ code: "not_found" });
    await expect(archiveProduct(A.ctx, bProduct.id)).rejects.toMatchObject({ code: "not_found" });
    const list = await listProducts(A.ctx, { q: "secreto" });
    expect(list.products).toHaveLength(0);
  });

  it("produtos: rotas HTTP retornam 404 para outra conta", async () => {
    const id = bProduct.id;
    expect((await call(productRoute.GET, req("GET", `/api/products/${id}`, { token: A.token }), { id })).status).toBe(404);
    expect((await call(productRoute.PATCH, req("PATCH", `/api/products/${id}`, { token: A.token, body: { name: "x" } }), { id })).status).toBe(404);
    expect((await call(productRoute.DELETE, req("DELETE", `/api/products/${id}`, { token: A.token }), { id })).status).toBe(404);
    const own = await call(productRoute.GET, req("GET", `/api/products/${id}`, { token: B.token }), { id });
    expect(own.status).toBe(200);
    expect(own.json.name).toBe("Produto secreto B");
    // orgId do corpo é ignorado: produto criado sempre na conta da sessão
    const created = await call(productsRoute.POST, req("POST", "/api/products", { token: A.token, body: { name: "Meu", orgId: B.orgId } }));
    expect(created.status).toBe(201);
    expect((await listProducts(B.ctx, { q: "meu" })).products).toHaveLength(0);
  });

  it("campanhas: leitura, edição e exclusão bloqueadas", async () => {
    await expect(getEditorState(A.ctx, bCampaignId)).rejects.toMatchObject({ code: "not_found" });
    await expect(saveCampaign(A.ctx, bCampaignId, { baseVersion: 1, campaign: { name: "x" } })).rejects.toMatchObject({ code: "not_found" });
    expect((await call(campaignRoute.GET, req("GET", `/api/campaigns/${bCampaignId}`, { token: A.token }), { id: bCampaignId })).status).toBe(404);
    expect((await call(campaignRoute.PUT, req("PUT", `/api/campaigns/${bCampaignId}`, { token: A.token, body: { baseVersion: 1 } }), { id: bCampaignId })).status).toBe(404);
    expect((await call(campaignRoute.DELETE, req("DELETE", `/api/campaigns/${bCampaignId}`, { token: A.token }), { id: bCampaignId })).status).toBe(404);
    expect((await listCampaigns(A.ctx, {})).map((c) => c.id)).not.toContain(bCampaignId);
    // A não pode criar campanha na loja de B nem usar produto de B
    await expect(createCampaign(A.ctx, { storeId: B.storeId, name: "x" })).rejects.toMatchObject({ code: "not_found" });
    await expect(createCampaign(A.ctx, { storeId: A.storeId, name: "x", productIds: [bProduct.id] })).rejects.toMatchObject({ code: "validation" });
  });

  it("imagens: sessão de outra conta não lê; URL assinada só vale para o próprio arquivo", async () => {
    await expect(readAsset(bAssetId, { ctx: A.ctx })).rejects.toMatchObject({ code: "not_found" });
    expect((await call(assetRoute.GET, req("GET", `/api/assets/${bAssetId}`, { token: A.token }), { id: bAssetId })).status).toBe(404);
    const own = await call(assetRoute.GET, req("GET", `/api/assets/${bAssetId}`, { token: B.token }), { id: bAssetId });
    expect(own.status).toBe(200);
    expect(own.res.headers.get("cache-control")).toMatch(/^private/);
    const signed = signedAssetUrl(bAssetId, B.orgId, 60);
    const ok = await call(assetRoute.GET, req("GET", signed), { id: bAssetId });
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("content-type")).toMatch(/^image\//);
    // token de B usado para outro id, ou token forjado com org de A
    const t = new URL(signed, "http://x").searchParams.get("t")!;
    expect((await call(assetRoute.GET, req("GET", `/api/assets/ast_outro?t=${encodeURIComponent(t)}`), { id: "ast_outro" })).status).toBe(401);
    const forged = signedAssetUrl(bAssetId, A.orgId, 60);
    expect((await call(assetRoute.GET, req("GET", forged), { id: bAssetId })).status).toBe(404);
    expect((await call(assetRoute.GET, req("GET", `/api/assets/${bAssetId}?t=lixo.lixo`), { id: bAssetId })).status).toBe(401);
    expect((await call(assetRoute.GET, req("GET", `/api/assets/${bAssetId}`), { id: bAssetId })).status).toBe(401);
  });

  it("exportações: listagem não mostra trabalhos de outra conta", async () => {
    const r = await call(exportsRoute.GET, req("GET", "/api/exports", { token: A.token }));
    expect(r.status).toBe(200);
    expect(r.json.exports).toHaveLength(0);
    const rb = await call(exportsRoute.GET, req("GET", "/api/exports", { token: B.token }));
    expect(rb.json.exports.length).toBeGreaterThan(0);
  });

  it("membros e lojas: sem acesso entre contas", async () => {
    expect((await listMembers(A.ctx)).map((m) => m.userId)).not.toContain(B.userId);
    await expect(updateMember(A.ctx, B.userId, { role: "editor" })).rejects.toMatchObject({ code: "not_found" });
    await expect(removeMember(A.ctx, B.userId)).rejects.toMatchObject({ code: "not_found" });
    expect((await call(membersRoute.PATCH, req("PATCH", `/api/members/${B.userId}`, { token: A.token, body: { role: "editor" } }), { userId: B.userId })).status).toBe(404);
    expect((await call(membersRoute.DELETE, req("DELETE", `/api/members/${B.userId}`, { token: A.token }), { userId: B.userId })).status).toBe(404);
    await expect(getStore(A.ctx, B.storeId)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateStore(A.ctx, B.storeId, { name: "Hackeada" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("membro restrito a uma filial só vê campanhas dessa filial", async () => {
    const org = await makeOrg({ plan: "profissional" });
    const branch = await createStore(org.ctx, { name: "Filial Sul" });
    const p = await makeProduct(org);
    const main = await createCampaign(org.ctx, { storeId: org.storeId, name: "Matriz", productIds: [p.id] });
    const other = await createCampaign(org.ctx, { storeId: branch.id, name: "Filial", productIds: [p.id] });
    const ed = await addMember(org, "editor", [branch.id]);
    const list = await listCampaigns(ed.ctx, {});
    expect(list.map((c) => c.id)).toEqual([other.campaign.id]);
    await expect(getEditorState(ed.ctx, main.campaign.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveCampaign(ed.ctx, main.campaign.id, { baseVersion: 1, campaign: { name: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createCampaign(ed.ctx, { storeId: org.storeId, name: "x" })).rejects.toMatchObject({ code: "forbidden" });
    // não pode mover a campanha para a matriz
    await expect(saveCampaign(ed.ctx, other.campaign.id, { baseVersion: 1, campaign: { storeId: org.storeId } })).rejects.toMatchObject({ code: "forbidden" });
    const ok = await saveCampaign(ed.ctx, other.campaign.id, { baseVersion: 1, campaign: { name: "Filial editada" } });
    expect(ok.campaign.name).toBe("Filial editada");
  });
});
