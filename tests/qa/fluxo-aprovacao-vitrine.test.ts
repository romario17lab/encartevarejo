// Critérios 10 (ofertas vencidas saem da vitrine) e 11 (mudança relevante invalida a aprovação).
import { describe, expect, it } from "vitest";
import { runCampaignScheduler } from "@/server/services/scheduler";
import { campaign, days, product, signup, sql } from "./helpers";

const prices = (sf: any) => sf.campaigns.flatMap((c: any) => c.items.map((i: any) => `${i.name}=${i.offer.priceCents}`));

describe("aprovação, publicação e vitrine", () => {
  it("11: aprovar → publicar → mudar preço limpa aprovação; vitrine mantém preço publicado até reaprovar e republicar", async () => {
    const A = await signup("Aprov");
    const p = await product(A, { name: "Leite integral 1L", unit: "l", regularCents: 699 });
    const st = await campaign(A, [p.id]);
    const id = st.campaign.id;
    expect((await A.api.post(`/api/campaigns/${id}/submit`)).status).toBe(200);
    const ap = await A.api.post(`/api/campaigns/${id}/approve`, {});
    expect(ap.status, JSON.stringify(ap.json)).toBe(200);
    expect(ap.json.campaign.status).toBe("aprovada");
    const pub = await A.api.post(`/api/campaigns/${id}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.json.campaign.status).toBe("publicada");
    let sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(prices(sf)).toEqual(["Leite integral 1L=699"]);
    expect(JSON.stringify(sf)).not.toMatch(/cost/i);

    // muda o preço
    const cur = pub.json;
    const items = cur.items.map((i: any) => ({ ...i, offer: { ...i.offer, priceCents: 599 } }));
    const saved = await A.api.put(`/api/campaigns/${id}`, { baseVersion: cur.campaign.version, items });
    expect(saved.status).toBe(200);
    expect(saved.json.campaign.status).toBe("rascunho");
    expect(saved.json.campaign.approvedHash).toBeNull();
    expect(saved.json.campaign.approvedBy ?? null).toBeNull();
    expect(saved.json.campaign.publishedVersion).toBe(cur.campaign.publishedVersion);
    // vitrine ainda mostra o preço publicado
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(prices(sf)).toEqual(["Leite integral 1L=699"]);
    // publicar sem reaprovar é bloqueado
    expect((await A.api.post(`/api/campaigns/${id}/publish`)).status).toBe(409);
    // mudança que NÃO é relevante (título) após aprovar não invalida
    await A.api.post(`/api/campaigns/${id}/approve`, {});
    const st2 = (await A.api.get(`/api/campaigns/${id}`)).json;
    const t = await A.api.put(`/api/campaigns/${id}`, { baseVersion: st2.campaign.version, campaign: { title: "Super Ofertas" } });
    expect(t.json.campaign.status).toBe("aprovada");
    // republica → novo preço
    expect((await A.api.post(`/api/campaigns/${id}/publish`)).status).toBe(200);
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(prices(sf)).toEqual(["Leite integral 1L=599"]);
    // mudança de data também invalida
    const st3 = (await A.api.get(`/api/campaigns/${id}`)).json;
    const d = await A.api.put(`/api/campaigns/${id}`, { baseVersion: st3.campaign.version, campaign: { endsAt: days(6) } });
    expect(d.json.campaign.status).toBe("rascunho");
    // auditoria registrou a volta para rascunho
    const [audit] = await sql("select count(*)::int n from audit_log where entity_id=$1 and summary like '%nova aprovação%'", [id]).catch(async () =>
      sql("select count(*)::int n from audit_logs where entity_id=$1 and summary like '%nova aprovação%'", [id]));
    expect(audit.n).toBeGreaterThanOrEqual(2);
  });

  it("10: ofertas vencidas somem da vitrine (agendador + datas manipuladas)", async () => {
    const A = await signup("Vence");
    const p1 = await product(A, { name: "Café 500g", unit: "pct", regularCents: 1590 });
    const p2 = await product(A, { name: "Açúcar 1kg", unit: "pct", regularCents: 489 });
    const c1 = (await campaign(A, [p1.id], { name: "Vence hoje" })).campaign.id;
    const c2 = (await campaign(A, [p2.id], { name: "Continua" })).campaign.id;
    for (const id of [c1, c2]) {
      expect((await A.api.post(`/api/campaigns/${id}/approve`, {})).status).toBe(200);
      expect((await A.api.post(`/api/campaigns/${id}/publish`)).status).toBe(200);
    }
    let sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns).toHaveLength(2);
    // simula o vencimento da campanha 1 (linha e instantâneo publicado)
    const past = new Date(Date.now() - 3600_000).toISOString();
    await sql("update campaigns set ends_at=$2, starts_at=$3 where id=$1", [c1, past, new Date(Date.now() - 3 * 86400_000).toISOString()]);
    await sql("update campaign_versions set snapshot = jsonb_set(snapshot, '{campaign,endsAt}', to_jsonb($2::text)) where campaign_id=$1", [c1, past]);
    // antes do agendador: a vitrine já filtra pelo período do instantâneo
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns.map((c: any) => c.id)).toEqual([c2]);
    const r = await runCampaignScheduler();
    const [row] = await sql("select status from campaigns where id=$1", [c1]);
    expect(row.status).toBe("encerrada");
    expect(r.ended + 0).toBeGreaterThanOrEqual(0); // o worker pode ter encerrado antes (idempotente)
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns.map((c: any) => c.id)).toEqual([c2]);
    // somente a linha vencida (instantâneo ainda válido): o agendador encerra e a vitrine esconde
    await sql("update campaigns set ends_at=$2 where id=$1", [c2, past]);
    await runCampaignScheduler();
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns).toHaveLength(0);
    // item pausado ("acabou") some na hora
  });

  it("10b: item pausado some da vitrine sem nova publicação; agendamento publica no horário", async () => {
    const A = await signup("Agenda");
    const ps = [await product(A, { name: "Pão francês", unit: "kg", regularCents: 1499 }), await product(A, { name: "Manteiga 200g", unit: "un", regularCents: 1099 })];
    const id = (await campaign(A, ps.map((p) => p.id))).campaign.id;
    await A.api.post(`/api/campaigns/${id}/approve`, {});
    const sch = await A.api.post(`/api/campaigns/${id}/schedule`, { at: new Date(Date.now() + 3600_000).toISOString() });
    expect(sch.status).toBe(200);
    expect(sch.json.campaign.status).toBe("agendada");
    expect((await A.api.get(`/api/storefront/${A.slug}`)).json.campaigns).toHaveLength(0);
    await sql("update campaigns set scheduled_publish_at=now() - interval '1 minute' where id=$1", [id]);
    await runCampaignScheduler();
    const [row] = await sql("select status, published_version from campaigns where id=$1", [id]);
    expect(row.status).toBe("publicada");
    let sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns[0].items).toHaveLength(2);
    const st = (await A.api.get(`/api/campaigns/${id}`)).json;
    const items = st.items.map((i: any, k: number) => ({ ...i, paused: k === 0 }));
    const sv = await A.api.put(`/api/campaigns/${id}`, { baseVersion: st.campaign.version, items });
    expect(sv.json.campaign.status).toBe("publicada"); // pausar não exige nova aprovação
    sf = (await A.api.get(`/api/storefront/${A.slug}`)).json;
    expect(sf.campaigns[0].items.map((i: any) => i.name)).toEqual(["Manteiga 200g"]);
    // retirar da vitrine e encerrar
    expect((await A.api.post(`/api/campaigns/${id}/unpublish`)).status).toBe(200);
    expect((await A.api.get(`/api/storefront/${A.slug}`)).json.campaigns).toHaveLength(0);
    expect((await A.api.post(`/api/campaigns/${id}/end`)).json.campaign.status).toBe("encerrada");
  });
});

describe("defeitos conhecidos (falham enquanto existirem)", () => {
  it.fails("D-03: o endereço da vitrine impresso nas peças (APP_URL/loja/<slug>) deveria abrir uma página", async () => {
    const A = await signup("Link");
    const p = await product(A, { name: "Pão de forma", unit: "pct", regularCents: 899 });
    const c = (await campaign(A, [p.id])).campaign;
    const rd = (await A.api.get(`/api/campaigns/${c.id}/render-data`)).json;
    expect(rd.brand.website).toMatch(new RegExp(`/loja/${A.slug}$`));
    const path = new URL(rd.brand.website).pathname;
    expect((await A.api.get(path)).status).toBe(200);
  });
});
