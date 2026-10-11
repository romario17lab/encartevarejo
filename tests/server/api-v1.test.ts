import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { clearAllRateLimits } from "@/server/auth/rate-limit";
import { createApiToken, decimalToCents, listApiTokens, revokeApiToken } from "@/server/services/api-tokens";
import { createImportProfile, deleteImportProfile, listImportProfiles, runImportProfile, updateImportProfile } from "@/server/services/import-profiles";
import { createStore } from "@/server/services/stores";
import * as tokensRoute from "@/app/api/api-tokens/route";
import * as productsV1 from "@/app/api/v1/products/route";
import * as pricesV1 from "@/app/api/v1/products/prices/route";
import * as storesV1 from "@/app/api/v1/stores/route";
import { addMember, call, makeOrg, makeProduct, req, type TestOrg } from "./helpers";

let A: TestOrg, B: TestOrg;
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const put = (t: string, body: unknown) => call(pricesV1.PUT, req("PUT", "/api/v1/products/prices", { headers: auth(t), body }));
const get = (t: string, qs = "") => call(productsV1.GET, req("GET", `/api/v1/products${qs}`, { headers: auth(t) }));

describe("tokens de API", () => {
  beforeAll(async () => { A = await makeOrg({ plan: "redes" }); B = await makeOrg(); });
  beforeEach(() => clearAllRateLimits());

  it("somente administrador cria/lista; token aparece uma vez e só o hash é salvo", async () => {
    const ed = await addMember(A, "editor");
    await expect(createApiToken(ed.ctx, { name: "ERP", scopes: ["products.read"] })).rejects.toMatchObject({ code: "forbidden" });
    expect((await call(tokensRoute.GET, req("GET", "/api/api-tokens", { token: ed.token }))).status).toBe(403);
    await expect(createApiToken(A.ctx, { name: "ERP", scopes: [] })).rejects.toBeTruthy();
    await expect(createApiToken(A.ctx, { name: "ERP", scopes: ["admin.all"] })).rejects.toBeTruthy();
    const r = await call(tokensRoute.POST, req("POST", "/api/api-tokens", { token: A.token, body: { name: "ERP da loja", scopes: ["products.read", "prices.write"] } }));
    expect(r.status).toBe(201);
    expect(r.json.token).toMatch(/^evk_[a-z0-9]{8}_/);
    expect(r.json.token.startsWith(r.json.prefix)).toBe(true);
    const [row] = await getDb().select().from(schema.apiTokens).where(eq(schema.apiTokens.id, r.json.id));
    expect(JSON.stringify(row)).not.toContain(r.json.token);
    const list = await listApiTokens(A.ctx);
    expect(JSON.stringify(list)).not.toContain(r.json.token);
    expect(list[0]).toMatchObject({ name: "ERP da loja", status: "ativo", lastUsedAt: null });
    // auditoria sem o token
    const audits = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, A.orgId), eq(schema.auditLog.action, "integration.token_create")));
    expect(JSON.stringify(audits)).not.toContain(r.json.token);
  });

  it("sem token, token inválido ou revogado → 401; último uso é registrado", async () => {
    expect((await call(productsV1.GET, req("GET", "/api/v1/products"))).status).toBe(401);
    expect((await get("evk_aaaaaaaa_naoexistenaoexistenaoexiste")).status).toBe(401);
    // cookie de sessão não serve para a API v1
    expect((await call(productsV1.GET, req("GET", "/api/v1/products", { token: A.token }))).status).toBe(401);
    const t = await createApiToken(A.ctx, { name: "Temp", scopes: ["products.read"] });
    const ok = await get(t.token);
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("cache-control")).toBe("no-store");
    const [row] = await getDb().select().from(schema.apiTokens).where(eq(schema.apiTokens.id, t.id));
    expect(row!.lastUsedAt).toBeTruthy();
    await revokeApiToken(A.ctx, t.id);
    expect((await get(t.token)).status).toBe(401);
    // outra conta não revoga
    const t2 = await createApiToken(A.ctx, { name: "Temp2", scopes: ["products.read"] });
    await expect(revokeApiToken(B.ctx, t2.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("escopos: leitura não escreve preços; escrita de preço não lê produtos", async () => {
    const ro = await createApiToken(A.ctx, { name: "Leitura", scopes: ["products.read"] });
    expect((await put(ro.token, { items: [{ barcode: "7890000000001", regularCents: 100 }] })).status).toBe(403);
    const wo = await createApiToken(A.ctx, { name: "Preços", scopes: ["prices.write"] });
    expect((await get(wo.token)).status).toBe(403);
  });

  describe("limite de requisições", () => {
    const prev = process.env.API_RATE_LIMIT;
    afterEach(() => { process.env.API_RATE_LIMIT = prev; clearAllRateLimits(); });
    it("passa do limite por token → 429 com Retry-After", async () => {
      process.env.API_RATE_LIMIT = "3";
      const t = await createApiToken(A.ctx, { name: "Limite", scopes: ["products.read"] });
      for (let i = 0; i < 3; i++) expect((await get(t.token)).status).toBe(200);
      const r = await get(t.token);
      expect(r.status).toBe(429);
      expect(r.res.headers.get("retry-after")).toBe("60");
      // outro token da mesma conta não é afetado
      const t2 = await createApiToken(A.ctx, { name: "Limite 2", scopes: ["products.read"] });
      expect((await get(t2.token)).status).toBe(200);
    });
  });
});

describe("API v1: produtos e preços", () => {
  let tok: string; let tokCreate: string; let tokB: string;
  let arroz: Awaited<ReturnType<typeof makeProduct>>;
  let feijao: Awaited<ReturnType<typeof makeProduct>>;
  let bSecret: Awaited<ReturnType<typeof makeProduct>>;
  let storeA2: string;

  beforeAll(async () => {
    if (!A) { A = await makeOrg({ plan: "redes" }); B = await makeOrg(); }
    clearAllRateLimits();
    tok = (await createApiToken(A.ctx, { name: "ERP", scopes: ["products.read", "prices.write"] })).token;
    tokCreate = (await createApiToken(A.ctx, { name: "ERP cadastro", scopes: ["products.read", "prices.write", "products.write"] })).token;
    tokB = (await createApiToken(B.ctx, { name: "ERP B", scopes: ["products.read", "prices.write", "products.write"] })).token;
    arroz = await makeProduct(A, { name: "Arroz 5kg", barcode: "7891000100103", regularCents: 2590, promoCents: null, costCents: 1800 });
    feijao = await makeProduct(A, { name: "Feijão 1kg", barcode: "7891000200209", regularCents: 899, promoCents: null });
    bSecret = await makeProduct(B, { name: "Segredo B", barcode: "7891000300305", regularCents: 100 });
    storeA2 = (await createStore(A.ctx, { name: `Filial ${Date.now()}` })).id;
  });
  beforeEach(() => clearAllRateLimits());

  it("valores decimais em texto viram centavos exatos", () => {
    expect(decimalToCents("12.90")).toBe(1290);
    expect(decimalToCents("12,9")).toBe(1290);
    expect(decimalToCents("0.07")).toBe(7);
    expect(decimalToCents("1290")).toBe(129000);
    expect(decimalToCents("1.234,56")).toBeNull();
    expect(decimalToCents("12.999")).toBeNull();
    expect(decimalToCents("-1")).toBeNull();
  });

  it("GET lista só a conta do token e nunca o custo", async () => {
    const r = await get(tok);
    expect(r.status).toBe(200);
    const names = r.json.products.map((p: { name: string }) => p.name);
    expect(names).toContain("Arroz 5kg");
    expect(names).not.toContain("Segredo B");
    expect(JSON.stringify(r.json)).not.toMatch(/cost/i);
    const byCode = await get(tok, "?barcode=7891000100103");
    expect(byCode.json.products).toHaveLength(1);
    expect((await get(tok, "?barcode=7891000300305")).json.products).toHaveLength(0);
    expect((await get(tok, `?storeId=${B.storeId}`)).status).toBe(404);
    expect((await get(tok, "?updatedSince=ontem")).status).toBe(422);
    const st = await call(storesV1.GET, req("GET", "/api/v1/stores", { headers: auth(tok) }));
    expect(st.json.stores.map((s: { id: string }) => s.id)).toContain(A.storeId);
    expect(st.json.stores.map((s: { id: string }) => s.id)).not.toContain(B.storeId);
  });

  it("PUT atualiza preços em centavos, informa códigos desconhecidos e é idempotente", async () => {
    const body = {
      items: [
        { barcode: "7891000100103", regularCents: 2490, promoPrice: "21.90" },
        { productId: feijao.id, promoPrice: "7,9" },
        { barcode: "7899999999999", regularCents: 100 },
        { barcode: "7891000100103x", regularCents: 100 },
        { barcode: "7891000200209", promoPrice: 7.9 },
        { barcode: "7891000200209", promoCents: 12.5 },
        { productId: arroz.id, regularCents: 1, regularPrice: "1" },
        { barcode: "7891000300305", regularCents: 1 },
        { productId: bSecret.id, regularCents: 1 },
        { name: "Sem código", regularCents: 100 },
      ],
    };
    const r = await put(tok, body);
    expect(r.status).toBe(200);
    const st = r.json.results.map((x: { status: string }) => x.status);
    expect(st).toEqual(["updated", "updated", "not_found", "invalid", "invalid", "invalid", "invalid", "not_found", "not_found", "invalid"]);
    expect(r.json.results[0]).toMatchObject({ productId: arroz.id, regularCents: 2490, promoCents: 2190 });
    expect(r.json.results[1]).toMatchObject({ productId: feijao.id, regularCents: 899, promoCents: 790 });
    expect(r.json.results[4].message).toMatch(/texto/);
    expect(r.json.summary).toMatchObject({ updated: 2, notFound: 3, invalid: 5, created: 0 });
    const [a] = await getDb().select().from(schema.products).where(eq(schema.products.id, arroz.id));
    expect(a).toMatchObject({ regularCents: 2490, promoCents: 2190, costCents: 1800 });
    // produto de outra conta intocado e nada criado
    const [b] = await getDb().select().from(schema.products).where(eq(schema.products.id, bSecret.id));
    expect(b!.regularCents).toBe(100);
    expect(await getDb().select().from(schema.products).where(and(eq(schema.products.orgId, A.orgId), eq(schema.products.barcode, "7899999999999")))).toHaveLength(0);
    // repetir a mesma requisição não muda nada
    const again = await put(tok, { items: body.items.slice(0, 2) });
    expect(again.json.results.map((x: { status: string }) => x.status)).toEqual(["unchanged", "unchanged"]);
    // auditoria com o nome do token, sem o token
    const audits = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, A.orgId), eq(schema.auditLog.action, "product.api_prices")));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.summary).toContain("ERP");
    expect(JSON.stringify(audits)).not.toContain(tok);
    // apagar promoção com null
    const clear = await put(tok, { items: [{ productId: arroz.id, promoCents: null }] });
    expect(clear.json.results[0]).toMatchObject({ status: "updated", promoCents: null, regularCents: 2490 });
  });

  it("produto repetido no lote e lote grande demais", async () => {
    const r = await put(tok, { items: [{ productId: feijao.id, regularCents: 900 }, { barcode: "7891000200209", regularCents: 901 }] });
    expect(r.json.results.map((x: { status: string }) => x.status)).toEqual(["updated", "invalid"]);
    const big = await put(tok, { items: Array.from({ length: 1001 }, () => ({ barcode: "7891000200209", regularCents: 1 })) });
    expect(big.status).toBe(422);
    expect((await put(tok, { items: [] })).status).toBe(422);
  });

  it("preço por loja (storeId) não altera o catálogo; loja de outra conta é bloqueada", async () => {
    const r = await put(tok, { storeId: storeA2, items: [{ barcode: "7891000100103", promoCents: 1999 }] });
    expect(r.json.results[0]).toMatchObject({ status: "updated", promoCents: 1999, regularCents: null });
    const [sp] = await getDb().select().from(schema.storePrices).where(and(eq(schema.storePrices.storeId, storeA2), eq(schema.storePrices.productId, arroz.id)));
    expect(sp).toMatchObject({ promoCents: 1999 });
    const [a] = await getDb().select().from(schema.products).where(eq(schema.products.id, arroz.id));
    expect(a!.promoCents).toBeNull();
    expect((await put(tok, { storeId: storeA2, items: [{ barcode: "7891000100103", promoCents: 1999 }] })).json.results[0].status).toBe("unchanged");
    expect((await put(tok, { storeId: B.storeId, items: [{ barcode: "7891000100103", promoCents: 1 }] })).status).toBe(404);
    // token de B não alcança produtos de A
    const cross = await put(tokB, { items: [{ productId: arroz.id, regularCents: 1 }, { barcode: "7891000100103", regularCents: 1 }] });
    expect(cross.json.results.map((x: { status: string }) => x.status)).toEqual(["not_found", "not_found"]);
    const listStore = await get(tok, `?storeId=${storeA2}&barcode=7891000100103`);
    expect(listStore.json.products[0].storePrice).toEqual({ regularCents: null, promoCents: 1999 });
  });

  it("só cadastra produto novo com dados completos e escopo products.write", async () => {
    const line = { barcode: "7891000400401", name: "Óleo de soja 900ml", unit: "un", regularPrice: "8.49" };
    const noScope = await put(tok, { items: [line] });
    expect(noScope.json.results[0]).toMatchObject({ status: "not_found" });
    expect(noScope.json.results[0].message).toMatch(/products\.write/);
    const incomplete = await put(tokCreate, { items: [{ barcode: "7891000400401", name: "Óleo", regularCents: 849 }] });
    expect(incomplete.json.results[0].status).toBe("not_found");
    const ok = await put(tokCreate, { items: [line] });
    expect(ok.json.results[0]).toMatchObject({ status: "created", regularCents: 849 });
    const [p] = await getDb().select().from(schema.products).where(eq(schema.products.id, ok.json.results[0].productId));
    expect(p).toMatchObject({ orgId: A.orgId, name: "Óleo de soja 900ml", unit: "un", barcode: "7891000400401", regularCents: 849, promoCents: null, brand: null, costCents: null });
    // repetir: já existe → unchanged (idempotente, sem duplicar)
    const again = await put(tokCreate, { items: [line] });
    expect(again.json.results[0].status).toBe("unchanged");
    expect(await getDb().select().from(schema.products).where(and(eq(schema.products.orgId, A.orgId), eq(schema.products.barcode, "7891000400401")))).toHaveLength(1);
  });

  it("código de barras duplicado no catálogo é ambíguo", async () => {
    await makeProduct(A, { name: "Arroz 5kg (dup)", barcode: "7891000100103" });
    const r = await put(tok, { items: [{ barcode: "7891000100103", regularCents: 1 }] });
    expect(r.json.results[0].status).toBe("ambiguous");
  });

  it("conta somente leitura bloqueia escrita (402) e mantém leitura", async () => {
    const C = await makeOrg();
    const t = await createApiToken(C.ctx, { name: "ERP", scopes: ["products.read", "prices.write"] });
    await getDb().update(schema.subscriptions).set({ status: "encerrada" }).where(eq(schema.subscriptions.orgId, C.orgId));
    const w = await put(t.token, { items: [{ barcode: "7891000100103", regularCents: 1 }] });
    expect(w.status).toBe(402);
    expect(w.json.error.code).toBe("subscription_inactive");
    expect((await get(t.token)).status).toBe(200);
    await getDb().update(schema.organizations).set({ suspendedAt: new Date() }).where(eq(schema.organizations.id, C.orgId));
    expect((await get(t.token)).status).toBe(403);
  });
});

describe("perfis de importação", () => {
  let O: TestOrg;
  beforeAll(async () => { O = await makeOrg(); });
  const csv = (s: string) => ({ data: Buffer.from(s, "utf8"), name: "export.csv" });

  it("salva, aplica em um passo, informa colunas faltantes e não mexe nas outras configurações", async () => {
    const { updateOrg } = await import("@/server/services/org");
    await updateOrg(O.ctx, { settings: { requireApproval: false } });
    const ed = await addMember(O, "aprovador");
    await expect(createImportProfile(ed.ctx, { name: "Semanal", mapping: { name: "Descricao" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createImportProfile(O.ctx, { name: "Sem nome", mapping: { barcode: "EAN" } })).rejects.toBeTruthy();
    await expect(createImportProfile(O.ctx, { name: "Repetida", mapping: { name: "A", brand: "A" } })).rejects.toBeTruthy();
    const p = await createImportProfile(O.ctx, { name: "Exportação semanal", mapping: { barcode: "EAN", name: "Descricao", unit: "Unidade", regularCents: "Preco Venda", promoCents: "Preco Promocao" }, onDuplicate: "update" });
    await expect(createImportProfile(O.ctx, { name: "exportação SEMANAL", mapping: { name: "x" } })).rejects.toMatchObject({ code: "conflict" });
    const listed = await listImportProfiles(ed.ctx);
    expect(listed.profiles.map((x) => x.name)).toEqual(["Exportação semanal"]);
    expect(listed.examples.length).toBeGreaterThanOrEqual(2);
    const [org] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, O.orgId));
    expect((org!.settings as Record<string, unknown>).requireApproval).toBe(false);

    const week1 = "EAN;Descricao;Unidade;Preco Venda;Preco Promocao\n7891000500507;Leite integral 1L;un;5,49;4,99\n7891000600603;Café 500g;un;18,90;\n";
    const r1 = await runImportProfile(O.ctx, p.id, csv(week1));
    expect(r1).toMatchObject({ created: 2, updated: 0, totalRows: 2 });
    const week2 = "EAN;Descricao;Unidade;Preco Venda;Preco Promocao;Extra\n7891000500507;Leite integral 1L;un;5,69;;x\n";
    const r2 = await runImportProfile(O.ctx, p.id, csv(week2));
    expect(r2).toMatchObject({ created: 0, updated: 1 });
    const [leite] = await getDb().select().from(schema.products).where(and(eq(schema.products.orgId, O.orgId), eq(schema.products.barcode, "7891000500507")));
    expect(leite).toMatchObject({ regularCents: 569, promoCents: 499 }); // célula vazia não apaga
    const miss = await runImportProfile(O.ctx, p.id, csv("Codigo;Nome\n1;x\n")).catch((e) => e);
    expect(miss).toMatchObject({ code: "validation" });
    expect([...miss.details.missingColumns].sort()).toEqual(["Descricao", "EAN", "Preco Promocao", "Preco Venda", "Unidade"]);
    expect(await getDb().select().from(schema.assets).where(and(eq(schema.assets.orgId, O.orgId), eq(schema.assets.kind, "import")))).toHaveLength(0);
    // outra conta não usa o perfil
    const other = await makeOrg();
    await expect(runImportProfile(other.ctx, p.id, csv(week1))).rejects.toMatchObject({ code: "not_found" });
    const up = await updateImportProfile(O.ctx, p.id, { onDuplicate: "skip" });
    expect(up.onDuplicate).toBe("skip");
    await deleteImportProfile(O.ctx, p.id);
    expect((await listImportProfiles(O.ctx)).profiles).toHaveLength(0);
  });
});
