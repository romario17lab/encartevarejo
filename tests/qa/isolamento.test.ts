// Critério 9 — uma conta não acessa dados privados de outra (HTTP real, duas contas reais).
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { signRenderToken } from "@/server/export/render-token";
import { signedAssetUrl } from "@/server/assets";
import { BASE, campaign, product, signup, sql, waitExport, type Account } from "./helpers";

let A: Account, B: Account;
let bProd: string, bCamp: string, bAsset: string, bExport: string, bBrandKit: string, aCamp: string;

describe("isolamento entre contas (HTTP)", () => {
  beforeAll(async () => {
    A = await signup("A"); B = await signup("B");
    bProd = (await product(B, { name: "Produto secreto B", regularCents: 1290, promoCents: 990, costCents: 500 })).id;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#00ff00" } }).png().toBuffer();
    const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "b.png");
    const up = await B.api.req("POST", "/api/assets", undefined, { form: fd });
    expect(up.status).toBeLessThan(300);
    bAsset = up.json.id;
    bCamp = (await campaign(B, [bProd])).campaign.id;
    aCamp = (await campaign(A, [(await product(A, { name: "Produto A", regularCents: 500 })).id])).campaign.id;
    const ex = await B.api.post(`/api/campaigns/${bCamp}/exports`, { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] });
    expect(ex.status).toBe(201);
    bExport = ex.json.id;
    await waitExport(B, bExport);
    bBrandKit = (await B.api.get("/api/me")).json.stores[0].brandKitId;
  });

  it("produtos de B: GET/PATCH/DELETE → 404 para A e nada muda", async () => {
    expect((await A.api.get(`/api/products/${bProd}`)).status).toBe(404);
    expect((await A.api.patch(`/api/products/${bProd}`, { name: "hack", regularCents: 1 })).status).toBe(404);
    expect((await A.api.del(`/api/products/${bProd}`)).status).toBe(404);
    const list = await A.api.get("/api/products?q=secreto");
    expect(JSON.stringify(list.json)).not.toContain(bProd);
    const own = await B.api.get(`/api/products/${bProd}`);
    expect(own.json.name ?? own.json.product?.name).toBe("Produto secreto B");
    expect((await A.api.patch(`/api/stores/${B.storeId}/prices`, { prices: [{ productId: bProd, regularCents: 1, promoCents: null }] })).status).toBeGreaterThanOrEqual(400);
    expect((await A.api.get(`/api/stores/${B.storeId}/prices`)).status).toBe(404);
  });

  it("campanhas de B: leitura, edição, ações e exclusão → 404", async () => {
    const paths = [
      ["GET", `/api/campaigns/${bCamp}`], ["PUT", `/api/campaigns/${bCamp}`], ["DELETE", `/api/campaigns/${bCamp}`],
      ["GET", `/api/campaigns/${bCamp}/render-data`], ["GET", `/api/campaigns/${bCamp}/versions`], ["GET", `/api/campaigns/${bCamp}/versions/1`],
      ["POST", `/api/campaigns/${bCamp}/versions/1/restore`], ["POST", `/api/campaigns/${bCamp}/template`], ["POST", `/api/campaigns/${bCamp}/duplicate`],
      ["POST", `/api/campaigns/${bCamp}/submit`], ["POST", `/api/campaigns/${bCamp}/approve`], ["POST", `/api/campaigns/${bCamp}/publish`],
      ["POST", `/api/campaigns/${bCamp}/end`], ["POST", `/api/campaigns/${bCamp}/unpublish`], ["POST", `/api/campaigns/${bCamp}/exports`],
      ["GET", `/api/campaigns/${bCamp}/exports`],
    ] as const;
    const body = (m: string, p: string) => p.endsWith("/template") ? { templateId: "vitrine-clean" } : p.endsWith("/exports") && m === "POST" ? { kind: "package" } : m === "PUT" ? { baseVersion: 1, campaign: { name: "hack" } } : {};
    const results: string[] = [];
    for (const [m, p] of paths) {
      const r = await A.api.req(m, p, m === "GET" || m === "DELETE" ? undefined : body(m, p));
      results.push(`${m} ${p.replace(bCamp, "B")} → ${r.status}`);
      if (m === "GET" && p.endsWith("/exports")) { expect(r.json.exports ?? []).toHaveLength(0); continue; }
      expect(r.status, `${m} ${p}`).toBe(404);
    }
    console.log(results.join("\n"));
    const cs = await A.api.get("/api/campaigns");
    expect(JSON.stringify(cs.json)).not.toContain(bCamp);
    expect((await A.api.post("/api/campaigns", { storeId: B.storeId, name: "x" })).status).toBe(404);
    const st = await B.api.get(`/api/campaigns/${bCamp}`);
    expect(st.json.campaign.name).not.toBe("hack");
    expect(st.json.campaign.status).toBe("rascunho");
  });

  it("arquivos (assets) de B: sessão de A → 404; URL assinada vale só para o próprio arquivo", async () => {
    expect((await A.api.get(`/api/assets/${bAsset}`)).status).toBe(404);
    expect((await B.api.get(`/api/assets/${bAsset}`)).status).toBe(200);
    const signed = signedAssetUrl(bAsset, B.orgId, 60);
    const t = new URL(signed, BASE).searchParams.get("t")!;
    const anon = (p: string) => fetch(BASE + p).then((r) => r.status);
    expect(await anon(signed)).toBe(200);
    // token de B reutilizado para outro arquivo / token com org de A para arquivo de B
    const aSigned = signedAssetUrl(bAsset, A.orgId, 60);
    expect(await anon(aSigned)).toBe(404);
    expect(await anon(`/api/assets/ast_inexistente000000000?t=${t}`)).toBeGreaterThanOrEqual(400);
    expect(await anon(`/api/assets/${bAsset}`)).toBe(401);
    // usar a foto de B numa campanha de A
    const stA = (await A.api.get(`/api/campaigns/${aCamp}`)).json;
    const items = stA.items.map((i: any) => ({ ...i, imageAssetId: bAsset }));
    expect((await A.api.put(`/api/campaigns/${aCamp}`, { baseVersion: stA.campaign.version, items })).status).toBe(422);
  });

  it("exportações de B: GET, download e listagem → 404/vazio", async () => {
    expect((await A.api.get(`/api/exports/${bExport}`)).status).toBe(404);
    expect((await A.api.get(`/api/exports/${bExport}/download`)).status).toBe(404);
    expect((await A.api.get(`/api/exports?campaignId=${bCamp}`)).json.exports).toHaveLength(0);
    expect((await B.api.get(`/api/exports/${bExport}/download`)).status).toBe(200);
    expect((await fetch(`${BASE}/api/exports/${bExport}/download`)).status).toBe(401);
  });

  it("membros, lojas, identidade, auditoria e convites de B", async () => {
    expect((await A.api.patch(`/api/members/${B.userId}`, { role: "editor" })).status).toBe(404);
    expect((await A.api.del(`/api/members/${B.userId}`)).status).toBe(404);
    expect(JSON.stringify((await A.api.get("/api/members")).json)).not.toContain(B.userId);
    expect((await A.api.get(`/api/stores/${B.storeId}`)).status).toBe(404);
    expect((await A.api.patch(`/api/stores/${B.storeId}`, { name: "hack" })).status).toBe(404);
    expect((await A.api.del(`/api/stores/${B.storeId}`)).status).toBe(404);
    expect((await A.api.patch(`/api/brand-kits/${bBrandKit}`, { name: "hack" })).status).toBe(404);
    const aud = await A.api.get(`/api/audit?entityType=campaign&entityId=${bCamp}`);
    expect(JSON.stringify(aud.json)).not.toContain("Produto secreto");
    expect((aud.json.entries ?? aud.json.items ?? [])).toHaveLength(0);
    expect((await A.api.post("/api/me/active-org", { orgId: B.orgId })).status).toBeGreaterThanOrEqual(400);
    const me = await B.api.get("/api/me");
    expect(me.json.role).toBe("admin");
  });

  it("/render com token de outra conta/campanha → página de erro, sem dados de B", async () => {
    // token válido de A para a campanha de A, usado na URL da campanha de B
    const tA = signRenderToken({ cid: aCamp, org: A.orgId, v: 1 });
    let html = await (await fetch(`${BASE}/render/${bCamp}?f=post_quadrado&p=0&t=${encodeURIComponent(tA)}`)).text();
    expect(html).toContain("data-ev-render-error");
    expect(html).not.toContain("Produto secreto");
    // token forjado com cid de B mas org de A
    const tForged = signRenderToken({ cid: bCamp, org: A.orgId, v: 1 });
    html = await (await fetch(`${BASE}/render/${bCamp}?f=post_quadrado&p=0&t=${encodeURIComponent(tForged)}`)).text();
    expect(html).toContain("data-ev-render-error");
    expect(html).not.toContain("Produto secreto");
    // sem token / token adulterado
    html = await (await fetch(`${BASE}/render/${bCamp}?f=post_quadrado&p=0`)).text();
    expect(html).not.toContain("Produto secreto");
    const tB = signRenderToken({ cid: bCamp, org: B.orgId, v: 1 });
    html = await (await fetch(`${BASE}/render/${bCamp}?f=post_quadrado&p=0&t=${encodeURIComponent(tB.slice(0, -2) + "xx")}`)).text();
    expect(html).not.toContain("Produto secreto");
    // controle: token correto mostra os dados (e nunca o custo)
    html = await (await fetch(`${BASE}/render/${bCamp}?f=post_quadrado&p=0&t=${encodeURIComponent(tB)}`)).text();
    expect(html).toContain("Produto secreto");
    expect(html).not.toMatch(/costCents|cost_cents/);
  });

  it("render-data e editor nunca expõem custo", async () => {
    const rd = await B.api.get(`/api/campaigns/${bCamp}/render-data`);
    expect(rd.status).toBe(200);
    expect(JSON.stringify(rd.json)).not.toMatch(/cost/i);
    const [row] = await sql("select cost_cents from products where id=$1", [bProd]);
    expect(row.cost_cents).toBe(500);
  });
});
