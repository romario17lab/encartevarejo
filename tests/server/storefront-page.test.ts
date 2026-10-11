// D-03: página pública da vitrine (/loja/<slug>) — publicada aparece, vencida some, slug desconhecido = 404.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createCampaign, saveCampaign } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { normalizeSource } from "@/server/services/storefront";
import LojaPage, { generateMetadata } from "@/app/loja/[slug]/page";
import { StorefrontView, type StorefrontViewData } from "@/components/storefront/StorefrontView";
import * as eventRoute from "@/app/api/storefront/[slug]/event/route";
import { call, days, makeOrg, makeProduct, req, templateId } from "./helpers";

type ViewEl = ReactElement<{ data: StorefrontViewData; qrSvg: string }>;
const render = async (slug: string, search: Record<string, string> = {}) =>
  (await LojaPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) })) as ViewEl;
const html = (el: ViewEl) => renderToStaticMarkup(createElement(StorefrontView, el.props));

async function published() {
  const org = await makeOrg();
  await getDb().update(schema.stores).set({ whatsapp: "(11) 98888-7777" }).where(eq(schema.stores.id, org.storeId));
  const p1 = await makeProduct(org, { name: "Arroz tipo 1 5kg", unit: "pct", category: "Mercearia", regularCents: 2990, promoCents: 2490, costCents: 1777 });
  const p2 = await makeProduct(org, { name: "Banana prata", unit: "kg", category: "Hortifrúti", regularCents: 699, promoCents: null, costCents: 333 });
  const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Semana", templateId: templateId(), startsAt: days(-1).toISOString(), endsAt: days(3).toISOString(), productIds: [p1.id, p2.id] });
  await transitionCampaign(org.ctx, st.campaign.id, "approve");
  const pub = await transitionCampaign(org.ctx, st.campaign.id, "publish");
  const [store] = await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId));
  return { org, campaignId: st.campaign.id, pub, slug: store!.slug };
}

describe("vitrine pública /loja/[slug] (D-03)", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("campanha publicada aparece com preços, categorias, WhatsApp e QR code; nunca o custo", async () => {
    const { slug } = await published();
    const el = await render(slug, { utm_source: "Encarte" });
    const d = el.props.data;
    expect(d.campaigns).toHaveLength(1);
    expect(d.campaigns[0]!.items.map((i) => i.name).sort()).toEqual(["Arroz tipo 1 5kg", "Banana prata"]);
    expect(d.store.whatsappNumber).toBe("5511988887777");
    expect(d.pageUrl).toMatch(new RegExp(`/loja/${slug}$`));
    expect(el.props.qrSvg).toMatch(/^<svg/);
    expect(JSON.stringify(d)).not.toMatch(/cost|1777|17,77|333\b/i);
    const out = html(el);
    expect(out).toContain("De R$ 29,90 por R$ 24,90/pct");
    expect(out).toContain("R$ 6,99/kg");
    expect(out).toContain("Mercearia");
    expect(out).toContain("Hortifrúti");
    expect(out).toContain("Buscar produto");
    expect(out).not.toContain("Nenhuma oferta ativa no momento");
    const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(String(meta.title)).toContain("Ofertas");
    expect(meta.openGraph?.url).toMatch(new RegExp(`/loja/${slug}$`));
  });

  it("depois do fim da validade a oferta some (estado vazio); item pausado some na hora", async () => {
    const { org, campaignId, pub, slug } = await published();
    const paused = pub.items.map((i) => (i.name === "Banana prata" ? { ...i, paused: true } : i));
    await saveCampaign(org.ctx, campaignId, { baseVersion: pub.campaign.version, items: paused });
    expect((await render(slug)).props.data.campaigns[0]!.items.map((i) => i.name)).toEqual(["Arroz tipo 1 5kg"]);

    // endsAt passa (campanha termina em 3 dias): relógio avançado só para Date
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(days(4));
    const el = await render(slug);
    expect(el.props.data.campaigns).toHaveLength(0);
    expect(html(el)).toContain("Nenhuma oferta ativa no momento");
    vi.useRealTimers();
  });

  it("slug desconhecido ou vitrine desativada = 404", async () => {
    await expect(render("loja-que-nao-existe")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    const { org, slug } = await published();
    await getDb().update(schema.stores).set({ storefrontEnabled: false }).where(eq(schema.stores.id, org.storeId));
    await expect(render(slug)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("eventos: clique no WhatsApp e compartilhamento com origem; loja desconhecida 404; dados inválidos 422", async () => {
    const { org, campaignId, slug } = await published();
    const r1 = await call(eventRoute.POST, req("POST", `/api/storefront/${slug}/event`, { body: { kind: "whatsapp_click", source: "Instagram Stories", campaignId } }), { slug });
    expect(r1.status).toBe(200);
    const r2 = await call(eventRoute.POST, req("POST", `/api/storefront/${slug}/event`, { body: { kind: "share", campaignId: "cmp_de_outra_conta" } }), { slug });
    expect(r2.status).toBe(200);
    const ev = await getDb().select().from(schema.storefrontEvents).where(eq(schema.storefrontEvents.storeId, org.storeId));
    expect(ev.find((e) => e.kind === "whatsapp_click")).toMatchObject({ source: "instagram-stories", campaignId, orgId: org.orgId });
    expect(ev.find((e) => e.kind === "share")).toMatchObject({ campaignId: null });
    expect((await call(eventRoute.POST, req("POST", "/api/storefront/nao-existe-mesmo/event", { body: { kind: "share" } }), { slug: "nao-existe-mesmo" })).status).toBe(404);
    expect((await call(eventRoute.POST, req("POST", `/api/storefront/${slug}/event`, { body: { kind: "view" } }), { slug })).status).toBe(422);
    expect(normalizeSource("  Folheto Impresso! ")).toBe("folheto-impresso");
  });
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
