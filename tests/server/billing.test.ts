// Cobrança em testes (Etapa 4). Nenhuma chamada real ao Stripe: eventos de webhook são fixtures
// assinadas localmente com o mesmo algoritmo do Stripe, e a API REST é simulada com fetch falso.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/server/db";
import { billingConfig } from "@/server/billing/config";
import { setBillingProviderForTests } from "@/server/billing";
import { StripeProvider, formEncode } from "@/server/billing/stripe";
import { stripeSignatureHeader, verifyStripeSignature } from "@/server/billing/stripe-signature";
import { entitlements, evaluateSubscription } from "@/server/services/subscriptions";
import { assertFeature, assertUsage, recordUsage } from "@/server/services/plans";
import { uploadImage } from "@/server/services/assets";
import { createCampaign } from "@/server/services/campaigns";
import * as webhookRoute from "@/app/api/billing/webhook/stripe/route";
import * as billingRoute from "@/app/api/billing/route";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import * as portalRoute from "@/app/api/billing/portal/route";
import * as cancelRoute from "@/app/api/billing/cancel/route";
import * as resumeRoute from "@/app/api/billing/resume/route";
import * as productsRoute from "@/app/api/products/route";
import * as orgExportRoute from "@/app/api/org/export/route";
import { addMember, call, days, makeOrg, makeProduct, req, uid, type TestOrg } from "./helpers";

const WHSEC = "whsec_teste_local_nao_e_segredo_real";
const SK = "sk_test_chave_falsa_para_testes";
const ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BILLING_ALLOW_LIVE", "BILLING_TRIAL_DAYS", "BILLING_GRACE_DAYS"] as const;
const savedEnv: Record<string, string | undefined> = {};

// ---------- Stripe simulado ----------
interface FakeCall { method: string; path: string; body: string }
let calls: FakeCall[] = [];
function fakeFetch(): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("https://api.stripe.com/v1", "");
    const body = String(init?.body ?? "");
    calls.push({ method: init?.method ?? "GET", path, body });
    const p = new URLSearchParams(body);
    let data: Record<string, unknown> = {};
    if (path === "/checkout/sessions") data = { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
    else if (path === "/billing_portal/sessions") data = { id: "bps_1", url: "https://billing.stripe.com/p/session/test_1" };
    else if (path.startsWith("/subscriptions/")) {
      const id = decodeURIComponent(path.split("/")[2]!);
      data = { id, object: "subscription", customer: "cus_x", status: "active", cancel_at_period_end: p.get("cancel_at_period_end") === "true",
        items: { data: [{ price: { id: "price_x" }, current_period_end: Math.floor(days(20).getTime() / 1000) }] } };
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
function useStripe() {
  process.env.STRIPE_SECRET_KEY = SK;
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  setBillingProviderForTests(new StripeProvider({ secretKey: SK, webhookSecret: WHSEC, testMode: true }, fakeFetch()));
}

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  calls = [];
  setBillingProviderForTests(null);
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  setBillingProviderForTests(null);
});

// ---------- eventos assinados ----------
let clock = Math.floor(Date.now() / 1000) - 50_000;
const tick = () => ++clock;
function evt(type: string, object: Record<string, unknown>, opts: { created?: number; livemode?: boolean; id?: string } = {}) {
  return { id: opts.id ?? `evt_${uid()}`, object: "event", type, created: opts.created ?? tick(), livemode: opts.livemode ?? false, data: { object } };
}
function webhookReq(body: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["stripe-signature"] = signature;
  return new NextRequest(new URL("/api/billing/webhook/stripe", "http://localhost:3101"), { method: "POST", headers, body });
}
async function send(e: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(e);
  return call(webhookRoute.POST, webhookReq(body, stripeSignatureHeader(body, opts.secret ?? WHSEC, opts.timestamp)));
}

const subObj = (o: { id: string; customer: string; orgId?: string; status: string; cancel?: boolean; price?: string; periodEnd?: Date }) => ({
  id: o.id, object: "subscription", customer: o.customer, status: o.status, cancel_at_period_end: o.cancel ?? false,
  metadata: o.orgId ? { orgId: o.orgId } : {},
  items: { data: [{ price: { id: o.price ?? "price_desconhecido" }, current_period_end: Math.floor((o.periodEnd ?? days(30)).getTime() / 1000) }] },
});
const invoiceObj = (sub: string, customer: string, amount = 9900) => ({
  id: `in_${uid()}`, object: "invoice", customer, subscription: sub, amount_paid: amount, amount_due: amount, currency: "brl",
  lines: { data: [{ period: { end: Math.floor(days(30).getTime() / 1000) } }] },
});

async function subOf(orgId: string) {
  const [s] = await getDb().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, orgId));
  return s!;
}

/** Conta com assinatura Stripe vinculada via checkout.session.completed. */
async function stripeOrg(): Promise<TestOrg & { sub: string; cus: string }> {
  const org = await makeOrg();
  const sub = `sub_${uid()}`; const cus = `cus_${uid()}`;
  const r = await send(evt("checkout.session.completed", { id: `cs_${uid()}`, object: "checkout.session", mode: "subscription", customer: cus, subscription: sub, client_reference_id: org.orgId, metadata: { orgId: org.orgId, planId: "inicial" }, payment_status: "paid" }));
  expect(r.status).toBe(200);
  return { ...org, sub, cus };
}

const writeProduct = (org: TestOrg) => call(productsRoute.POST, req("POST", "/api/products", { token: org.token, body: { name: `Produto ${uid()}`, unit: "un", regularCents: 999 } }));

// ======================================================================

describe("assinatura do webhook (Stripe-Signature)", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  it("aceita assinatura válida e recusa inválida, ausente, malformada e expirada", () => {
    const now = 1_800_000_000;
    expect(verifyStripeSignature(payload, stripeSignatureHeader(payload, WHSEC, now), WHSEC, { nowSec: now + 10 })).toMatchObject({ ok: true });
    expect(verifyStripeSignature(payload, stripeSignatureHeader(payload, "whsec_outro", now), WHSEC, { nowSec: now })).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyStripeSignature(payload + " ", stripeSignatureHeader(payload, WHSEC, now), WHSEC, { nowSec: now })).toMatchObject({ ok: false, reason: "mismatch" });
    expect(verifyStripeSignature(payload, null, WHSEC)).toMatchObject({ ok: false, reason: "missing" });
    expect(verifyStripeSignature(payload, "t=abc,v1=zz", WHSEC)).toMatchObject({ ok: false, reason: "malformed" });
    expect(verifyStripeSignature(payload, stripeSignatureHeader(payload, WHSEC, now), WHSEC, { nowSec: now + 301 })).toMatchObject({ ok: false, reason: "expired" });
    // vários v1 (rotação de segredo): basta um conferir
    const h = `t=${now},v1=${"0".repeat(64)},${stripeSignatureHeader(payload, WHSEC, now).split(",")[1]}`;
    expect(verifyStripeSignature(payload, h, WHSEC, { nowSec: now })).toMatchObject({ ok: true });
  });

  it("rota: 400 para assinatura inválida/expirada, 404 sem provedor configurado, nada gravado", async () => {
    const e = evt("invoice.paid", invoiceObj("sub_x", "cus_x"));
    // sem Stripe configurado
    expect((await send(e)).status).toBe(404);
    useStripe();
    expect((await send(e, { secret: "whsec_errado" })).status).toBe(400);
    expect((await send(e, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    const r = await call(webhookRoute.POST, webhookReq(JSON.stringify(e), null));
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("invalid_signature");
    const [{ n }] = await getDb().select({ n: count() }).from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, e.id));
    expect(n).toBe(0);
  });
});

describe("configuração", () => {
  it("chave de produção é recusada por padrão; sem credenciais o provedor é manual", () => {
    expect(billingConfig().provider).toBe("manual");
    process.env.STRIPE_SECRET_KEY = "sk_live_qualquer"; process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
    const c = billingConfig();
    expect(c.provider).toBe("manual");
    expect(c.stripe).toBeNull();
    expect(c.stripeProblem).toMatch(/produção .* recusada/);
    expect(JSON.stringify(c)).not.toContain("sk_live_qualquer");
    process.env.BILLING_ALLOW_LIVE = "1";
    expect(billingConfig().stripe?.testMode).toBe(false);
    delete process.env.BILLING_ALLOW_LIVE;
    process.env.STRIPE_SECRET_KEY = SK;
    expect(billingConfig()).toMatchObject({ provider: "stripe", stripe: { testMode: true } });
    process.env.BILLING_TRIAL_DAYS = "30"; process.env.BILLING_GRACE_DAYS = "abc";
    expect(billingConfig()).toMatchObject({ trialDays: 30, graceDays: 7 });
  });

  it("evento de produção (livemode) é ignorado no modo de testes", async () => {
    useStripe();
    const org = await stripeOrg();
    await send(evt("invoice.payment_failed", invoiceObj(org.sub, org.cus), { livemode: true }));
    expect((await subOf(org.orgId)).status).toBe("ativa");
  });

  it("codificação de formulário no padrão do Stripe", () => {
    expect(formEncode({ a: 1, b: { c: "x y" }, d: [{ e: true }] })).toBe("a=1&b%5Bc%5D=x%20y&d%5B0%5D%5Be%5D=true");
  });
});

describe("ciclo de vida da assinatura", () => {
  it("conta nova começa em teste; conta antiga sem assinatura vale como manual/ativa", async () => {
    const org = await makeOrg();
    const s = await subOf(org.orgId);
    expect(s).toMatchObject({ status: "teste", provider: "manual" });
    expect(Math.round((s.trialEndsAt!.getTime() - Date.now()) / 86400000)).toBe(14);
    const old = await makeOrg();
    await getDb().delete(schema.subscriptions).where(eq(schema.subscriptions.orgId, old.orgId));
    const ent = await entitlements(old.orgId);
    expect(ent).toMatchObject({ status: "ativa", readOnly: false, subscription: { provider: "manual", stored: false } });
    expect((await writeProduct(old)).status).toBe(201);
  });

  it("teste → ativa → falha → carência → somente leitura → pagamento restaura", async () => {
    useStripe();
    const org = await stripeOrg();
    expect(await subOf(org.orgId)).toMatchObject({ status: "ativa", provider: "stripe", providerCustomerId: org.cus, providerSubscriptionId: org.sub, testMode: true });

    // falha de pagamento: inadimplente com carência; ainda pode editar
    const failCreated = tick();
    await send(evt("invoice.payment_failed", invoiceObj(org.sub, org.cus), { created: failCreated }));
    let s = await subOf(org.orgId);
    expect(s.status).toBe("inadimplente");
    expect(s.graceUntil!.getTime()).toBe((failCreated + 7 * 86400) * 1000);
    expect((await writeProduct(org)).status).toBe(201);
    // segunda falha não estende a carência
    await send(evt("invoice.payment_failed", invoiceObj(org.sub, org.cus)));
    expect((await subOf(org.orgId)).graceUntil!.getTime()).toBe(s.graceUntil!.getTime());

    // carência vencida → somente leitura
    await getDb().update(schema.subscriptions).set({ graceUntil: days(-1) }).where(eq(schema.subscriptions.orgId, org.orgId));
    const blocked = await writeProduct(org);
    expect(blocked.status).toBe(402);
    expect(blocked.json.error.code).toBe("subscription_inactive");
    expect(blocked.json.error.message).toMatch(/somente leitura/);
    // leitura, exportação dos dados e cobrança continuam liberadas
    expect((await call(productsRoute.GET, req("GET", "/api/products", { token: org.token }))).status).toBe(200);
    expect((await call(orgExportRoute.GET, req("GET", "/api/org/export", { token: org.token }))).status).toBe(200);
    const portal = await call(portalRoute.POST, req("POST", "/api/billing/portal", { token: org.token, body: {} }));
    expect(portal.status).toBe(200);
    expect(portal.json.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    const ov = await call(billingRoute.GET, req("GET", "/api/billing", { token: org.token }));
    expect(ov.json).toMatchObject({ readOnly: true, subscription: { status: "inadimplente" } });
    expect(ov.json.alerts[0].kind).toBe("read_only");

    // pagamento confirmado restaura
    await send(evt("invoice.paid", invoiceObj(org.sub, org.cus)));
    s = await subOf(org.orgId);
    expect(s).toMatchObject({ status: "ativa", graceUntil: null });
    expect((await writeProduct(org)).status).toBe(201);
  });

  it("idempotência: o mesmo evento duas vezes é processado uma vez", async () => {
    useStripe();
    const org = await stripeOrg();
    const e = evt("invoice.payment_failed", invoiceObj(org.sub, org.cus));
    const a = await send(e); const b = await send(e);
    expect(a.json).toMatchObject({ received: true, duplicate: false });
    expect(b.json).toMatchObject({ received: true, duplicate: true });
    const [{ n }] = await getDb().select({ n: count() }).from(schema.billingEvents).where(and(eq(schema.billingEvents.provider, "stripe"), eq(schema.billingEvents.providerEventId, e.id)));
    expect(n).toBe(1);
    const audits = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.orgId, org.orgId), eq(schema.auditLog.action, "billing.status")));
    expect(audits.filter((x) => x.summary.includes("Pagamento pendente"))).toHaveLength(1);
  });

  it("eventos fora de ordem: evento mais antigo não desfaz estado mais novo", async () => {
    useStripe();
    const org = await stripeOrg();
    const t = tick(); tick();
    await send(evt("customer.subscription.updated", subObj({ id: org.sub, customer: org.cus, status: "past_due" }), { created: t + 1 }));
    const old = evt("customer.subscription.updated", subObj({ id: org.sub, customer: org.cus, status: "active" }), { created: t });
    const r = await send(old);
    expect(r.json.status).toBe("ignorado");
    expect((await subOf(org.orgId)).status).toBe("inadimplente");
    const [row] = await getDb().select().from(schema.billingEvents).where(eq(schema.billingEvents.providerEventId, old.id));
    expect(row).toMatchObject({ status: "ignorado", orgId: org.orgId });
    // resumo não guarda dados sensíveis
    expect(JSON.stringify(row!.summary)).not.toMatch(/email|card|@/);
  });

  it("troca de plano pelo preço do provedor atualiza organizations.planId", async () => {
    useStripe();
    const price = `price_${uid()}`;
    const planId = `pro_${uid()}`;
    await getDb().insert(schema.plans).values({ id: planId, name: "Profissional teste", priceCents: 9900, providerPriceId: price, isActive: false,
      limits: { stores: 3, users: 8, storageMb: 5120, exportsPerMonth: 1000, videoMinutesPerMonth: 10, aiCreditsPerMonth: 100, features: ["vitrine"] } });
    const org = await stripeOrg();
    await send(evt("customer.subscription.updated", subObj({ id: org.sub, customer: org.cus, status: "active", price })));
    const [o] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, org.orgId));
    expect(o!.planId).toBe(planId);
    expect((await subOf(org.orgId)).planId).toBe(planId);
  });

  it("cancelamento no fim do período, desistência e encerramento", async () => {
    useStripe();
    const org = await stripeOrg();
    const c = await call(cancelRoute.POST, req("POST", "/api/billing/cancel", { token: org.token, body: {} }));
    expect(c.status).toBe(200);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: `/subscriptions/${org.sub}`, body: "cancel_at_period_end=true" });
    expect(c.json.subscription).toMatchObject({ status: "cancelada", cancelAtPeriodEnd: true });
    expect((await writeProduct(org)).status).toBe(201); // até o fim do período tudo funciona

    const r = await call(resumeRoute.POST, req("POST", "/api/billing/resume", { token: org.token, body: {} }));
    expect(r.json.subscription).toMatchObject({ status: "ativa", cancelAtPeriodEnd: false });
    await call(cancelRoute.POST, req("POST", "/api/billing/cancel", { token: org.token, body: {} }));

    // fim do período sem webhook: já conta como encerrada
    await getDb().update(schema.subscriptions).set({ currentPeriodEnd: days(-1) }).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(await entitlements(org.orgId)).toMatchObject({ status: "encerrada", readOnly: true });
    // webhook de exclusão encerra de vez
    await send(evt("customer.subscription.deleted", subObj({ id: org.sub, customer: org.cus, status: "canceled" })));
    expect(await subOf(org.orgId)).toMatchObject({ status: "encerrada", cancelAtPeriodEnd: false });
    expect((await writeProduct(org)).status).toBe(402);
  });

  it("reembolso: parcial só registra; total encerra o acesso", async () => {
    useStripe();
    const org = await stripeOrg();
    const charge = (refunded: number) => ({ id: `ch_${uid()}`, object: "charge", customer: org.cus, amount: 9900, amount_refunded: refunded, refunded: refunded >= 9900, currency: "brl",
      billing_details: { email: "cliente@exemplo.com" }, payment_method_details: { card: { last4: "4242" } } });
    const p = evt("charge.refunded", charge(1000));
    await send(p);
    expect((await subOf(org.orgId)).status).toBe("ativa");
    await send(evt("charge.refunded", charge(9900)));
    expect((await subOf(org.orgId)).status).toBe("encerrada");
    expect((await writeProduct(org)).status).toBe(402);
    const rows = await getDb().select().from(schema.billingEvents).where(eq(schema.billingEvents.orgId, org.orgId));
    const all = JSON.stringify(rows.map((r) => r.summary));
    expect(all).not.toContain("cliente@exemplo.com");
    expect(all).not.toContain("4242");
  });

  it("teste vencido: somente leitura só quando há pagamento online configurado", async () => {
    const org = await makeOrg();
    await getDb().update(schema.subscriptions).set({ trialEndsAt: days(-1) }).where(eq(schema.subscriptions.orgId, org.orgId));
    expect(await entitlements(org.orgId)).toMatchObject({ readOnly: false });
    expect((await writeProduct(org)).status).toBe(201);
    useStripe();
    expect(await entitlements(org.orgId)).toMatchObject({ readOnly: true });
    expect((await writeProduct(org)).status).toBe(402);
    // avisos do banner
    const ev = evaluateSubscription({ status: "teste", trialEndsAt: days(2), graceUntil: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }, { paymentEnabled: true });
    expect(ev.alerts[0]).toMatchObject({ kind: "trial_ending" });
  });

  it("somente leitura permite excluir a conta", async () => {
    const org = await makeOrg();
    await getDb().update(schema.subscriptions).set({ status: "encerrada" }).where(eq(schema.subscriptions.orgId, org.orgId));
    const { DELETE } = await import("@/app/api/org/route");
    const [o] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, org.orgId));
    const r = await call(DELETE, req("DELETE", "/api/org", { token: org.token, body: { confirmName: o!.name } }));
    expect(r.status).toBe(200);
  });
});

describe("checkout e permissões", () => {
  it("sem provedor: checkout recusado com explicação; GET mostra que o pagamento não está habilitado", async () => {
    const org = await makeOrg();
    const r = await call(checkoutRoute.POST, req("POST", "/api/billing/checkout", { token: org.token, body: { planId: "profissional" } }));
    expect(r.status).toBe(422);
    expect(r.json.error.message).toMatch(/pagamento online ainda não está habilitado/);
    const g = await call(billingRoute.GET, req("GET", "/api/billing", { token: org.token }));
    expect(g.json.provider).toMatchObject({ name: "manual", configured: false });
    expect(g.json.plans.every((p: { checkoutAvailable: boolean }) => !p.checkoutAvailable)).toBe(true);
  });

  it("plano sem preço não pode ser assinado; com preço gera checkout no modo de testes", async () => {
    useStripe();
    const org = await makeOrg();
    const r = await call(checkoutRoute.POST, req("POST", "/api/billing/checkout", { token: org.token, body: { planId: "profissional" } }));
    expect(r.status).toBe(422);
    expect(r.json.error.message).toMatch(/ainda não foi definido/);
    expect(calls).toHaveLength(0);

    const planId = `prc_${uid()}`; const price = `price_${uid()}`;
    await getDb().insert(schema.plans).values({ id: planId, name: "Plano com preço", priceCents: 4990, providerPriceId: price, sortOrder: 99,
      limits: { stores: 1, users: 2, storageMb: 100, exportsPerMonth: 10, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: [] } });
    const ok = await call(checkoutRoute.POST, req("POST", "/api/billing/checkout", { token: org.token, body: { planId } }));
    expect(ok.status).toBe(200);
    expect(ok.json.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const body = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.path).toBe("/checkout/sessions");
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe(price);
    expect(body.get("client_reference_id")).toBe(org.orgId);
    expect(body.get("subscription_data[metadata][orgId]")).toBe(org.orgId);
    expect(body.get("subscription_data[trial_end]")).toBeTruthy(); // aproveita o teste restante
    const g = await call(billingRoute.GET, req("GET", "/api/billing", { token: org.token }));
    expect(g.json.plans.find((p: { id: string }) => p.id === planId)).toMatchObject({ checkoutAvailable: true, priceCents: 4990 });
    expect(g.json.plans.find((p: { id: string }) => p.id === "profissional")).toMatchObject({ checkoutAvailable: false, priceCents: null });
    await getDb().update(schema.plans).set({ isActive: false }).where(eq(schema.plans.id, planId));
  });

  it("somente administradores da conta alteram a cobrança", async () => {
    useStripe();
    const org = await makeOrg();
    const ed = await addMember(org, "editor");
    for (const route of [checkoutRoute.POST, portalRoute.POST, cancelRoute.POST, resumeRoute.POST]) {
      const r = await call(route, req("POST", "/api/billing/x", { token: ed.token, body: { planId: "inicial" } }));
      expect(r.status).toBe(403);
    }
    const g = await call(billingRoute.GET, req("GET", "/api/billing", { token: ed.token }));
    expect(g.status).toBe(200);
    expect(g.json).toMatchObject({ canManage: false, history: [] });
  });
});

describe("isolamento entre contas", () => {
  it("webhook da conta A nunca altera a conta B; GET /api/billing mostra só a própria conta", async () => {
    useStripe();
    const A = await stripeOrg();
    const B = await stripeOrg();
    // evento da assinatura de A com metadados apontando para B: vale o vínculo gravado (A)
    await send(evt("customer.subscription.updated", { ...subObj({ id: A.sub, customer: A.cus, status: "past_due" }), metadata: { orgId: B.orgId } }));
    expect((await subOf(A.orgId)).status).toBe("inadimplente");
    expect((await subOf(B.orgId)).status).toBe("ativa");
    // assinatura nova de outro cliente tentando se vincular a B (que já tem cliente): ignorada
    const r = await send(evt("customer.subscription.created", subObj({ id: `sub_${uid()}`, customer: `cus_${uid()}`, orgId: B.orgId, status: "canceled" })));
    expect(r.json.status).toBe("ignorado");
    expect((await subOf(B.orgId)).status).toBe("ativa");
    // evento sem conta identificável
    const u = await send(evt("invoice.paid", invoiceObj(`sub_${uid()}`, `cus_${uid()}`)));
    expect(u.json.status).toBe("ignorado");

    const ga = await call(billingRoute.GET, req("GET", "/api/billing", { token: A.token }));
    const gb = await call(billingRoute.GET, req("GET", "/api/billing", { token: B.token }));
    expect(ga.json.subscription.status).toBe("inadimplente");
    expect(gb.json.subscription.status).toBe("ativa");
    expect(gb.json.history.length).toBeGreaterThan(0);
    const bEvents = await getDb().select({ id: schema.billingEvents.id }).from(schema.billingEvents).where(eq(schema.billingEvents.orgId, A.orgId));
    expect(bEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(gb.json)).not.toContain(A.orgId);
    expect(JSON.stringify(gb.json)).not.toContain(A.sub);
  });
});

describe("limites do plano", () => {
  async function limitedOrg(limits: Partial<typeof schema.plans.$inferSelect["limits"]>) {
    const planId = `lim_${uid()}`;
    await getDb().insert(schema.plans).values({ id: planId, name: "Limitado", isActive: false,
      limits: { stores: 1, users: 2, storageMb: 1, exportsPerMonth: 1, videoMinutesPerMonth: 1, aiCreditsPerMonth: 5, features: ["vitrine"], ...limits } });
    return makeOrg({ plan: planId });
  }

  it("exportações por mês contam os pedidos do mês", async () => {
    const org = await limitedOrg({ exportsPerMonth: 1 });
    await assertUsage(org.orgId, "exports", 1);
    const p = await makeProduct(org);
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: `Ofertas ${uid()}`, startsAt: days(0).toISOString(), endsAt: days(6).toISOString(), productIds: [p.id] });
    await getDb().insert(schema.exportJobs).values({ id: `exp_${uid()}`, orgId: org.orgId, campaignId: st.campaign.id, campaignVersion: 1, request: { kind: "single", items: [] }, createdBy: org.userId });
    await expect(assertUsage(org.orgId, "exports", 1)).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/1 exportações por mês/) });
    // pedido do mês passado não conta
    await getDb().update(schema.exportJobs).set({ createdAt: days(-40) }).where(eq(schema.exportJobs.orgId, org.orgId));
    await assertUsage(org.orgId, "exports", 1);
  });

  it("armazenamento: soma dos bytes dos arquivos, verificada no envio", async () => {
    const org = await limitedOrg({ storageMb: 1 });
    await getDb().insert(schema.assets).values({ id: `ast_${uid()}`, orgId: org.orgId, kind: "image", storageKey: "x", mime: "image/png", bytes: 1024 * 1024 - 100, source: "upload_lojista" });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c00" } }).png().toBuffer();
    await expect(uploadImage(org.ctx, { data: png })).rejects.toMatchObject({ code: "limit_reached", message: expect.stringMatching(/armazenamento/) });
  });

  it("IA, vídeo e recursos avançados: limites finitos e recursos fora do plano", async () => {
    const org = await limitedOrg({ aiCreditsPerMonth: 5, videoMinutesPerMonth: 0 });
    await recordUsage(org.orgId, "ai_credit", 4);
    await assertUsage(org.orgId, "ai_credit", 1);
    await expect(assertUsage(org.orgId, "ai_credit", 2)).rejects.toMatchObject({ code: "limit_reached" });
    await expect(assertUsage(org.orgId, "video_second", 1)).rejects.toMatchObject({ message: expect.stringMatching(/não inclui vídeos/) });
    await assertFeature(org.orgId, "vitrine");
    await expect(assertFeature(org.orgId, "agendamento")).rejects.toMatchObject({ code: "limit_reached" });
    const g = await call(billingRoute.GET, req("GET", "/api/billing", { token: org.token }));
    expect(g.json.usage).toMatchObject({ aiCredits: { used: 4, limit: 5 }, videoMinutes: { used: 0, limit: 0 }, stores: { used: 1, limit: 1 } });
  });
});
