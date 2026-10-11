// IA assistida — testes com provedor HTTP FALSO (nenhuma chamada real à Anthropic nem ao remove.bg).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { configureAi } from "@/server/ai/config";
import { setAiTransport, type FetchLike } from "@/server/ai/http";
import { numbersInText, stripUnknownPrices } from "@/server/ai/guards";
import { clearAllRateLimits } from "@/server/auth/rate-limit";
import { uploadImage } from "@/server/services/assets";
import { createCampaign, getEditorState } from "@/server/services/campaigns";
import { guardLines } from "@/server/services/ai-extract";
import { sanitizeIdeas } from "@/server/services/ai-campaigns";
import { pickHighlights } from "@/server/services/ai-organize";
import { emptyOffer } from "@/domain/offer";
import type { CampaignItem } from "@/domain/campaign";
import * as statusRoute from "@/app/api/ai/status/route";
import * as requestsRoute from "@/app/api/ai/requests/route";
import * as extractRoute from "@/app/api/ai/extract/route";
import * as commitRoute from "@/app/api/ai/extract/commit/route";
import * as bgRoute from "@/app/api/ai/remove-background/route";
import * as textsRoute from "@/app/api/ai/campaigns/[id]/texts/route";
import * as organizeRoute from "@/app/api/ai/campaigns/[id]/organize/route";
import * as ideasRoute from "@/app/api/ai/campaign-ideas/route";
import * as draftRoute from "@/app/api/ai/campaign-ideas/draft/route";
import * as parseTextRoute from "@/app/api/products/parse-text/route";
import { addMember, call, makeOrg, makeProduct, req, uid, type TestOrg } from "./helpers";

// ---------------- provedor falso ----------------
type Call = { url: string; body: unknown; headers: Record<string, string> };
let calls: Call[] = [];
let replies: Array<(c: Call) => Response | Promise<Response>> = [];

const fake: FetchLike = async (url, init) => {
  const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  let body: unknown = null;
  if (typeof init.body === "string") body = JSON.parse(init.body);
  const c = { url, body, headers };
  calls.push(c);
  const next = replies.shift();
  if (!next) throw new Error("provedor falso sem resposta programada");
  return next(c);
};
/** Resposta da Messages API com o JSON estruturado informado. */
const claudeReply = (data: unknown) => () => new Response(JSON.stringify({
  model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 },
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(data) }],
}), { status: 200, headers: { "content-type": "application/json" } });
const httpError = (status: number) => () => new Response(JSON.stringify({ type: "error", error: { type: "x", message: "segredo do provedor" } }), { status });

const line = (o: Record<string, unknown>) => ({
  sourceText: "", name: null, brand: null, size: null, unit: null, price: null, priceFrom: null, conditions: null, categorySuggestion: null,
  confidence: { name: "alta", brand: "alta", size: "alta", unit: "alta", price: "alta", conditions: "alta" }, ...o,
});

async function aiPlanOrg(credits = 100): Promise<TestOrg> {
  const planId = `ia_${uid()}`;
  await getDb().insert(schema.plans).values({ id: planId, name: "Plano IA", isActive: false,
    limits: { stores: 3, users: 8, storageMb: 100, exportsPerMonth: 100, videoMinutesPerMonth: 0, aiCreditsPerMonth: credits, features: ["vitrine"] } });
  return makeOrg({ plan: planId });
}

const LIST = "Arroz Tio João 5kg 24,90\nFeijão carioca 1kg - 7,49\nBanana prata kg 4,99";

beforeEach(() => {
  calls = []; replies = [];
  clearAllRateLimits();
  setAiTransport(fake);
  configureAi({ anthropicKey: "sk-ant-teste", removeBgKey: "rb-teste", retryBaseMs: 1, maxRetries: 2, timeoutMs: 5000 });
});
afterEach(() => { setAiTransport(null); configureAi(); });

describe("IA: sem configuração", () => {
  it("mostra 'não configurado' e o caminho manual continua funcionando", async () => {
    configureAi({ anthropicKey: null, removeBgKey: null });
    const org = await aiPlanOrg();
    const st = await call(statusRoute.GET, req("GET", "/api/ai/status", { token: org.token }));
    expect(st.status).toBe(200);
    expect(st.json.configured).toEqual({ llm: false, backgroundRemoval: false });

    const ex = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(ex.status).toBe(503);
    expect(ex.json.error.code).toBe("ai_not_configured");
    expect(ex.json.error.message).toMatch(/não está configurada/);

    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#0a0" } }).png().toBuffer();
    const a = await uploadImage(org.ctx, { data: png });
    const bg = await call(bgRoute.POST, req("POST", "/api/ai/remove-background", { token: org.token, body: { assetId: a.id } }));
    expect(bg.status).toBe(503);

    // caminho manual (parser determinístico) segue igual
    const manual = await call(parseTextRoute.POST, req("POST", "/api/products/parse-text", { token: org.token, body: { text: LIST } }));
    expect(manual.status).toBe(200);
    expect(manual.json.rows).toHaveLength(3);
    expect(calls).toHaveLength(0);
    const rows = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.orgId, org.orgId));
    expect(rows).toHaveLength(0);
  });
});

describe("IA: extração de listas", () => {
  it("devolve linhas para revisão, sem salvar nada, com null para campos ausentes e trava de preço", async () => {
    const org = await aiPlanOrg();
    const existing = await makeProduct(org, { name: "Feijão carioca", sizeLabel: "1kg", unit: "pct", regularCents: 799 });
    const before = await getDb().select().from(schema.products).where(eq(schema.products.orgId, org.orgId));
    replies.push(claudeReply({
      lines: [
        // preço 23,90 NÃO está no texto (o texto diz 24,90); marca "Camil" e unidade "pct" também não
        line({ sourceText: "Arroz Tio João 5kg 24,90", name: "Arroz Tio João", brand: "Camil", size: "5kg", unit: "pct", price: "23,90" }),
        line({ sourceText: "Feijão carioca 1kg - 7,49", name: "Feijão carioca", size: "1kg", price: "7,49" }),
        line({ sourceText: "Banana prata kg 4,99", name: "Banana prata", unit: "kg", price: "4,99", conditions: "limite 2 por cliente" }),
      ],
      notes: null,
    }));
    const r = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(r.status).toBe(200);
    expect(r.json.reviewRequired).toBe(true);
    const [arroz, feijao, banana] = r.json.lines;
    expect(arroz.regularCents).toBeNull();
    expect(arroz.flags.join(" ")).toMatch(/Preço removido: o valor não aparece no texto original/);
    expect(arroz.brand).toBeNull();
    expect(arroz.unit).toBeNull();
    expect(arroz.sizeLabel).toBe("5kg");
    expect(feijao).toMatchObject({ name: "Feijão carioca", regularCents: 749, promoCents: null, brand: null, unit: null, conditions: null });
    expect(feijao.match).toMatchObject({ productId: existing.id, kind: "igual" });
    expect(banana).toMatchObject({ unit: "kg", regularCents: 499, conditions: null });
    expect(banana.flags.join(" ")).toMatch(/Condição removida/);

    // pedido enviado com saída estruturada, modelo configurado e chave só no cabeçalho
    const sent = calls[0]!;
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.headers["x-api-key"]).toBe("sk-ant-teste");
    expect(sent.body).toMatchObject({ model: "claude-sonnet-5-5", output_config: { format: { type: "json_schema" } } });
    expect(JSON.stringify(sent.body)).not.toContain("sk-ant-teste");

    // nada foi salvo pela extração
    const after = await getDb().select().from(schema.products).where(eq(schema.products.orgId, org.orgId));
    expect(after).toHaveLength(before.length);
    // pedido registrado (sem o texto colado no resumo) e créditos consumidos
    const [row] = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.id, r.json.requestId));
    expect(row).toMatchObject({ kind: "extrair_lista", status: "concluida", provider: "anthropic", model: "claude-sonnet-5-5", credits: 1 });
    expect(JSON.stringify(row!.inputSummary)).not.toContain("Arroz");
  });

  it("revisão obrigatória: só linhas confirmadas são salvas, uma única vez", async () => {
    const org = await aiPlanOrg();
    const existing = await makeProduct(org, { name: "Feijão carioca", sizeLabel: "1kg", unit: "pct", regularCents: 799, promoCents: null });
    replies.push(claudeReply({ lines: [line({ sourceText: "Arroz Tio João 5kg 24,90", name: "Arroz Tio João", size: "5kg", price: "24,90" })], notes: null }));
    const r = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    const requestId = r.json.requestId;

    const noConfirm = await call(commitRoute.POST, req("POST", "/api/ai/extract/commit", { token: org.token, body: { requestId, lines: [{ action: "create", name: "Arroz Tio João", regularCents: 2490 }] } }));
    expect(noConfirm.status).toBe(422);
    expect(await getDb().select().from(schema.products).where(and(eq(schema.products.orgId, org.orgId), eq(schema.products.name, "Arroz Tio João")))).toHaveLength(0);

    const ok = await call(commitRoute.POST, req("POST", "/api/ai/extract/commit", { token: org.token, body: { requestId, lines: [
      { confirmed: true, action: "create", name: "Arroz Tio João", sizeLabel: "5kg", unit: "pct", regularCents: 2490, promoCents: null },
      { confirmed: true, action: "update", productId: existing.id, name: "Feijão carioca", promoCents: 749 },
    ] } }));
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ created: 1, updated: 1 });
    const [feijao] = await getDb().select().from(schema.products).where(eq(schema.products.id, existing.id));
    expect(feijao).toMatchObject({ regularCents: 799, promoCents: 749, unit: "pct" });
    const [row] = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.id, requestId));
    expect(row!.status).toBe("revisada");
    expect(row!.reviewedBy).toBe(org.userId);

    const again = await call(commitRoute.POST, req("POST", "/api/ai/extract/commit", { token: org.token, body: { requestId, lines: [{ confirmed: true, action: "create", name: "X" }] } }));
    expect(again.status).toBe(409);
  });

  it("foto: todos os preços ficam marcados para conferir; arquivo inválido é recusado", async () => {
    const org = await aiPlanOrg();
    replies.push(claudeReply({ lines: [line({ sourceText: "Leite 1L 4,59", name: "Leite integral", size: "1L", price: "4,59", confidence: { name: "alta", brand: "alta", size: "alta", unit: "alta", price: "baixa", conditions: "alta" } })], notes: "foto um pouco tremida" }));
    const jpg = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(jpg)], { type: "image/jpeg" }), "lista.jpg");
    const r = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, form }));
    expect(r.status).toBe(200);
    expect(r.json.sourceType).toBe("imagem");
    expect(r.json.lines[0]).toMatchObject({ regularCents: 459, priceCheck: true, unit: null, brand: null });
    expect(r.json.lines[0].flags.join(" ")).toMatch(/confira com a foto/);
    // imagem enviada reduzida e em base64 (bloco image)
    const block = (calls[0]!.body as { messages: Array<{ content: Array<{ type: string }> }> }).messages[0]!.content[0]!;
    expect(block.type).toBe("image");
    const [row] = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.id, r.json.requestId));
    expect(row!.credits).toBe(2);

    const bad = new FormData();
    bad.append("file", new Blob([Buffer.from("não é imagem")], { type: "image/png" }), "x.png");
    const rb = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, form: bad }));
    expect(rb.status).toBe(422);
    const exe = new FormData();
    exe.append("file", new Blob([Buffer.from("MZ")], { type: "application/x-msdownload" }), "x.exe");
    expect((await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, form: exe }))).status).toBe(422);
    expect(calls).toHaveLength(1);
  });

  it("trava de preços (unidade): só aceita valores que aparecem no texto", () => {
    expect([...numbersInText("Arroz 24,90 e 1.234,56 · R$ 7")].sort((a, b) => a - b)).toEqual(expect.arrayContaining([700, 2490, 123456]));
    const out = guardLines({ lines: [line({ sourceText: "Café 500g 18,90", name: "Café", size: "500g", price: "19,90", priceFrom: "18,90" }) as never], notes: null }, "texto", "Café 500g 18,90");
    expect(out[0]!.promoCents).toBeNull();
    expect(out[0]!.regularCents).toBe(1890); // só o preço que existe no texto sobrevive
    expect(out[0]!.flags.join(" ")).toMatch(/Preço removido/);
  });
});

describe("IA: controle de consumo", () => {
  it("respeita o limite de créditos do plano e registra cada pedido", async () => {
    const org = await aiPlanOrg(2);
    for (let i = 0; i < 2; i++) {
      replies.push(claudeReply({ lines: [line({ sourceText: "Arroz Tio João 5kg 24,90", name: "Arroz", price: "24,90" })], notes: null }));
      const r = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
      expect(r.status).toBe(200);
    }
    const third = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(third.status).toBe(402);
    expect(third.json.error.code).toBe("limit_reached");
    expect(calls).toHaveLength(2); // o terceiro nem chegou ao provedor
    const usage = await getDb().select().from(schema.usageEvents).where(and(eq(schema.usageEvents.orgId, org.orgId), eq(schema.usageEvents.kind, "ai_credit")));
    expect(usage.map((u) => u.quantity)).toEqual([1, 1]);
    const reqs = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.orgId, org.orgId));
    expect(reqs).toHaveLength(2);
    expect(new Set(usage.map((u) => u.ref))).toEqual(new Set(reqs.map((r) => r.id)));

    const hist = await call(requestsRoute.GET, req("GET", "/api/ai/requests", { token: org.token }));
    expect(hist.json.credits).toMatchObject({ used: 2, limit: 2 });
    expect(hist.json.requests).toHaveLength(2);
  });

  it("plano sem IA (0 créditos) bloqueia; falha do provedor não consome créditos; 429 é tentado de novo", async () => {
    const none = await aiPlanOrg(0);
    const blocked = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: none.token, body: { text: LIST } }));
    expect(blocked.status).toBe(402);
    expect(blocked.json.error.message).toMatch(/não inclui recursos de IA/);

    const org = await aiPlanOrg(10);
    replies.push(httpError(500), httpError(503), httpError(500));
    const fail = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(fail.status).toBe(502);
    expect(fail.json.error.message).toMatch(/indisponível/);
    expect(fail.json.error.message).not.toMatch(/segredo/);
    expect(calls).toHaveLength(3); // 1 + 2 novas tentativas
    const [failed] = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.orgId, org.orgId));
    expect(failed).toMatchObject({ status: "falhou", credits: 0 });
    expect(await getDb().select().from(schema.usageEvents).where(eq(schema.usageEvents.orgId, org.orgId))).toHaveLength(0);

    calls = [];
    replies.push(httpError(429), claudeReply({ lines: [], notes: null }));
    const retried = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(retried.status).toBe(200);
    expect(calls).toHaveLength(2);

    replies.push(httpError(401));
    const auth = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: org.token, body: { text: LIST } }));
    expect(auth.status).toBe(502);
    expect(auth.json.error.message).toMatch(/chave de acesso/);
  });
});

describe("IA: remoção de fundo", () => {
  it("cria um arquivo NOVO com origem e parentAssetId; a original fica intacta", async () => {
    const org = await aiPlanOrg();
    const jpg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#3a5" } }).jpeg().toBuffer();
    const orig = await uploadImage(org.ctx, { data: jpg, sourceNote: "foto da loja" });
    const [origRow] = await getDb().select().from(schema.assets).where(eq(schema.assets.id, orig.id));
    const cut = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    replies.push(() => new Response(new Uint8Array(cut), { status: 200, headers: { "content-type": "image/png" } }));

    const r = await call(bgRoute.POST, req("POST", "/api/ai/remove-background", { token: org.token, body: { assetId: orig.id } }));
    expect(r.status).toBe(200);
    expect(r.json.original.id).toBe(orig.id);
    expect(r.json.result.id).not.toBe(orig.id);
    expect(r.json.result).toMatchObject({ source: "ia_remocao_fundo", parentAssetId: orig.id });
    expect(calls[0]!.url).toBe("https://api.remove.bg/v1.0/removebg");
    expect(calls[0]!.headers["x-api-key"]).toBe("rb-teste");

    const [newRow] = await getDb().select().from(schema.assets).where(eq(schema.assets.id, r.json.result.id));
    expect(newRow).toMatchObject({ source: "ia_remocao_fundo", parentAssetId: orig.id, mime: "image/png", kind: "image" });
    expect(newRow!.sourceNote).toMatch(/remove\.bg/);
    const [origAfter] = await getDb().select().from(schema.assets).where(eq(schema.assets.id, orig.id));
    expect(origAfter).toEqual(origRow);
    const [req1] = await getDb().select().from(schema.aiRequests).where(eq(schema.aiRequests.id, r.json.requestId));
    expect(req1).toMatchObject({ kind: "remover_fundo", provider: "remove.bg", status: "concluida", credits: 1 });

    // segunda vez reaproveita, sem nova chamada nem créditos
    const again = await call(bgRoute.POST, req("POST", "/api/ai/remove-background", { token: org.token, body: { assetId: orig.id } }));
    expect(again.json).toMatchObject({ reused: true, requestId: null, result: { id: r.json.result.id } });
    expect(calls).toHaveLength(1);
    // a versão sem fundo não é recortada de novo
    const derived = await call(bgRoute.POST, req("POST", "/api/ai/remove-background", { token: org.token, body: { assetId: r.json.result.id } }));
    expect(derived.status).toBe(422);
  });
});

describe("IA: isolamento e permissões", () => {
  it("outra conta não usa arquivos nem pedidos alheios; aprovador não extrai", async () => {
    const a = await aiPlanOrg();
    const b = await aiPlanOrg();
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#123" } }).png().toBuffer();
    const asset = await uploadImage(a.ctx, { data: png });
    const bg = await call(bgRoute.POST, req("POST", "/api/ai/remove-background", { token: b.token, body: { assetId: asset.id } }));
    expect(bg.status).toBe(404);

    replies.push(claudeReply({ lines: [line({ sourceText: "Arroz Tio João 5kg 24,90", name: "Arroz", price: "24,90" })], notes: null }));
    const ex = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: a.token, body: { text: LIST } }));
    const steal = await call(commitRoute.POST, req("POST", "/api/ai/extract/commit", { token: b.token, body: { requestId: ex.json.requestId, lines: [{ confirmed: true, action: "create", name: "Arroz" }] } }));
    expect(steal.status).toBe(404);
    const histB = await call(requestsRoute.GET, req("GET", "/api/ai/requests", { token: b.token }));
    expect(histB.json.requests).toHaveLength(0);

    const cmpA = await createCampaign(a.ctx, { storeId: a.storeId, name: "Campanha A" });
    const t = await call(textsRoute.POST, req("POST", "/x", { token: b.token }), { id: cmpA.campaign.id });
    expect(t.status).toBe(404);

    const apr = await addMember(a, "aprovador");
    const denied = await call(extractRoute.POST, req("POST", "/api/ai/extract", { token: apr.token, body: { text: LIST } }));
    expect(denied.status).toBe(403);
    expect(calls).toHaveLength(1);
  });
});

describe("IA: sugestões de textos", () => {
  it("usa os preços exatamente como salvos e remove valores inventados", async () => {
    const org = await aiPlanOrg();
    const p1 = await makeProduct(org, { name: "Café Pilão 500g", regularCents: 1999, promoCents: 1690, unit: "pct" });
    const p2 = await makeProduct(org, { name: "Leite integral 1L", regularCents: 549, promoCents: null, unit: "un" });
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Semana", productIds: [p1.id, p2.id], startsAt: "2026-10-12T03:00:00Z", endsAt: "2026-10-18T23:00:00Z" });
    replies.push(claudeReply({
      title: "Ofertas a partir de R$ 3,00",
      subtitle: "Na {{loja}}",
      descriptions: [{ n: 1, text: "Café encorpado por R$ 9,99" }, { n: 2, text: "Leite para o dia a dia" }, { n: 9, text: "item inexistente" }],
      caption: "☕ Café: {{oferta:1}}\n🥛 Leite: {{oferta:2}}\nSó hoje R$ 1,99! {{validade}}",
    }));
    const r = await call(textsRoute.POST, req("POST", "/x", { token: org.token }), { id: st.campaign.id });
    expect(r.status).toBe(200);
    expect(r.json.caption).toContain("De R$ 19,99 por R$ 16,90/pct");
    expect(r.json.caption).toContain("R$ 5,49/un");
    expect(r.json.caption).not.toContain("1,99");
    expect(r.json.caption).toContain("[preço removido]");
    expect(r.json.caption).toMatch(/Ofertas válidas de 12\/10 a 18\/10/);
    expect(r.json.title).not.toMatch(/3,00/);
    expect(r.json.descriptions).toHaveLength(2);
    expect(r.json.descriptions[0].text).not.toContain("9,99");
    expect(r.json.warnings.join(" ")).toMatch(/removidos/);
    // o modelo não recebeu preços
    expect(JSON.stringify(calls[0]!.body)).not.toMatch(/1690|16,90|1999/);
    // nada foi alterado na campanha
    const after = await getEditorState(org.ctx, st.campaign.id);
    expect(after.campaign.title).toBe(st.campaign.title);
  });

  it("guarda de preços em textos (unidade)", () => {
    const r = stripUnknownPrices("Arroz R$ 24,90, feijão R$ 7,50 e 3,33", new Set([2490]));
    expect(r.text).toBe("Arroz R$ 24,90, feijão [preço removido] e [preço removido]");
    expect(r.removed).toEqual(["R$ 7,50", "3,33"]);
  });
});

describe("IA: organização e sugestões de campanha", () => {
  it("destaques pelos maiores descontos reais e categorias do catálogo, sem aplicar nada", async () => {
    configureAi({ anthropicKey: null }); // só a parte determinística
    const org = await aiPlanOrg();
    const prods = [];
    for (const [name, reg, promo, cat] of [["A", 1000, 900, "Mercearia"], ["B", 1000, 500, "Bebidas"], ["C", 1000, 700, null], ["D", 1000, null, "Mercearia"], ["E", 2000, 1000, "Bebidas"], ["F", 1000, 950, null], ["G", 800, 600, "Limpeza"]] as const)
      prods.push(await makeProduct(org, { name, regularCents: reg, promoCents: promo, category: cat }));
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Org", productIds: prods.map((p) => p.id) });
    const r = await call(organizeRoute.POST, req("POST", "/x", { token: org.token }), { id: st.campaign.id });
    expect(r.status).toBe(200);
    const hl = r.json.changes.filter((c: { type: string }) => c.type === "highlight").map((c: { name: string }) => c.name);
    expect(hl).toEqual(["E", "B", "C"]); // 50% (maior economia em R$ desempata), 50%, 30%
    expect(r.json.changes.some((c: { type: string }) => c.type === "order")).toBe(true);
    expect(r.json.notes.join(" ")).toMatch(/sem categoria/);
    expect(r.json.requestId).toBeNull();
    const after = await getEditorState(org.ctx, st.campaign.id);
    expect(after.items.every((i) => !i.highlight)).toBe(true);
  });

  it("pickHighlights ignora itens sem preço de referência", () => {
    const mk = (id: string, o: Partial<CampaignItem["offer"]>): CampaignItem => ({ id, productId: null, name: id, brand: null, sizeLabel: null, unit: "un", category: null, imageAssetId: null, imageFit: { x: 50, y: 50, zoom: 1 }, offer: { ...emptyOffer(), ...o }, highlight: false, position: 0, paused: false });
    expect(pickHighlights([mk("a", { priceCents: 100 }), mk("b", { mode: "from_to", priceCents: 50, regularCents: 100 }), mk("c", { priceCents: 100 })])).toEqual(["b"]);
  });

  it("ideias só com produtos existentes; rascunho usa preços do catálogo", async () => {
    const org = await aiPlanOrg();
    const p = await makeProduct(org, { name: "Picanha", regularCents: 6990, promoCents: 5990, unit: "kg", category: "Açougue" });
    replies.push(claudeReply({ ideas: [
      { theme: "Churrasco do fim de semana", eventName: null, startDate: "2000-01-01", endDate: "2099-01-01", categories: ["Açougue"], productRefs: ["P1", "P99"], rationale: "Clima de churrasco." },
      { theme: "Inválida", eventName: null, startDate: "ontem", endDate: "amanhã", categories: [], productRefs: [], rationale: "" },
    ] }));
    const r = await call(ideasRoute.POST, req("POST", "/api/ai/campaign-ideas", { token: org.token, body: { days: 30 } }));
    expect(r.status).toBe(200);
    // primeira: datas ajustadas à janela pedida e produto inexistente descartado; segunda: datas inválidas
    expect(r.json.ideas).toHaveLength(1);
    expect(r.json.ideas[0]).toMatchObject({ startDate: r.json.from, endDate: r.json.to, products: [{ id: p.id, hasPrice: true }] });
    const s = sanitizeIdeas({ ideas: [{ theme: "Churrasco", eventName: "Inventado", startDate: r.json.from, endDate: r.json.from, categories: ["Açougue"], productRefs: ["P1", "p1", "P99"], rationale: "x" }] },
      { from: r.json.from, to: r.json.to, events: [], refs: new Map([["P1", { id: p.id, name: "Picanha", sizeLabel: null, category: "Açougue", hasPrice: true }]]) });
    expect(s[0]!.products.map((x) => x.id)).toEqual([p.id]);
    expect(s[0]!.eventName).toBeNull();
    expect(JSON.stringify(calls[0]!.body)).not.toMatch(/6990|69,90|5990/);

    const d = await call(draftRoute.POST, req("POST", "/x", { token: org.token, body: { requestId: r.json.requestId, storeId: org.storeId, name: "Churrasco", startDate: r.json.from, endDate: r.json.to, productIds: [p.id] } }));
    expect(d.status).toBe(201);
    const st = await getEditorState(org.ctx, d.json.campaignId);
    expect(st.campaign.status).toBe("rascunho");
    expect(st.items[0]!.offer).toMatchObject({ mode: "from_to", priceCents: 5990, regularCents: 6990 });
  });
});
