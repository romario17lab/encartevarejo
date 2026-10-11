// Critério 12 — campanhas antigas mantêm a versão do modelo.
// (a) em processo: registra uma versão "N+1" falsa SOMENTE na memória deste teste (N = versão mais recente
//     publicada hoje; era 1 na Etapa 2, hoje é 3) e confere que campanha fixada na N continua N em
//     render-data/editor/salvamento, enquanto campanha nova pega a N+1;
// (b) via HTTP (servidor real): campanha fixada numa versão inexistente NÃO é "atualizada" em silêncio —
//     a renderização/exportação recusam com mensagem clara.
import { describe, expect, it } from "vitest";
import { TEMPLATE_VERSIONS, getTemplate } from "@/templates/registry";
import { latestPublishedVersion } from "@/server/services/templates";
import { loadRenderBundle } from "@/server/services/render-data";
import { createCampaign, getEditorState, saveCampaign, switchTemplate } from "@/server/services/campaigns";
import { signRenderToken } from "@/server/export/render-token";
import type { TenantCtx } from "@/server/context";
import { BASE, campaign, days, product, signup, sql } from "./helpers";

describe("versão do modelo", () => {
  it("campanha fixada na versão atual não é atualizada quando surge uma nova (em processo)", async () => {
    const A = await signup("Versao");
    const p = await product(A, { name: "Arroz 5kg", unit: "pct", regularCents: 2490 });
    const N = (await latestPublishedVersion("feira-da-semana"))!; // versão que campanhas novas recebem hoje
    const old = (await campaign(A, [p.id])).campaign;
    expect(old.templateVersion).toBe(N);
    const ctx: TenantCtx = { userId: A.userId, orgId: A.orgId, role: "admin", storeIds: null, isPlatformAdmin: false };

    const vN = getTemplate("feira-da-semana", N)!;
    const fakeV2 = { ...vN, version: N + 1, name: "Feira da Semana (versão nova de teste)" };
    TEMPLATE_VERSIONS.push(fakeV2);
    try {
      expect(getTemplate("feira-da-semana")!.version).toBe(N + 1);
      const b = await loadRenderBundle({ orgId: A.orgId }, old.id, { version: "current" });
      expect(b.templateVersion).toBe(N);
      const st = await getEditorState(ctx, old.id);
      expect(st.template).toMatchObject({ id: "feira-da-semana", version: N, latestVersion: N + 1 });
      const saved = await saveCampaign(ctx, old.id, { baseVersion: st.campaign.version, campaign: { title: "Ofertas do Mês" } });
      expect(saved.campaign.templateVersion).toBe(N);
      const fresh = await createCampaign(ctx, { storeId: A.storeId, name: "Nova", templateId: "feira-da-semana", startsAt: days(0), endsAt: days(3), productIds: [p.id] });
      expect(fresh.campaign.templateVersion).toBe(N + 1);
      // troca explícita de versão (ação do usuário) funciona nos dois sentidos (inclusive para a v1 antiga)
      const up = await switchTemplate(ctx, old.id, { templateId: "feira-da-semana", templateVersion: N + 1 });
      expect(up.campaign.templateVersion).toBe(N + 1);
      const down = await switchTemplate(ctx, old.id, { templateId: "feira-da-semana", templateVersion: 1 });
      expect(down.campaign.templateVersion).toBe(1);
    } finally {
      TEMPLATE_VERSIONS.splice(TEMPLATE_VERSIONS.indexOf(fakeV2), 1);
    }
  });

  it("servidor real: versão gravada é respeitada; versão indisponível não vira a mais recente", async () => {
    const A = await signup("Versao2");
    const p = await product(A, { name: "Feijão 1kg", unit: "pct", regularCents: 749 });
    const N = (await latestPublishedVersion("feira-da-semana"))!; // versão que campanhas novas recebem hoje
    const c = (await campaign(A, [p.id])).campaign;
    // render-data/editor seguem o que está gravado
    let st = (await A.api.get(`/api/campaigns/${c.id}`)).json;
    expect(st.template).toMatchObject({ id: "feira-da-semana", version: N });
    // simula projeto antigo fixado numa versão que não existe neste servidor
    await sql("update campaigns set template_version=7 where id=$1", [c.id]);
    await sql("update campaign_versions set snapshot = jsonb_set(snapshot, '{campaign,templateVersion}', '7'::jsonb) where campaign_id=$1", [c.id]);
    st = (await A.api.get(`/api/campaigns/${c.id}`)).json;
    expect(st.campaign.templateVersion).toBe(7);
    const t = signRenderToken({ cid: c.id, org: A.orgId, v: st.campaign.version });
    const html = await (await fetch(`${BASE}/render/${c.id}?f=post_quadrado&p=0&v=${st.campaign.version}&t=${encodeURIComponent(t)}`)).text();
    expect(html).toContain("data-ev-render-error");
    expect(html).toMatch(/feira-da-semana v7 não está disponível/);
    const ex = await A.api.post(`/api/campaigns/${c.id}/exports`, { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] });
    expect(ex.status).toBe(422);
    expect(ex.json.error.message).toMatch(/modelo desta campanha não está disponível/i);
    // salvar não altera a versão gravada
    const sv = await A.api.put(`/api/campaigns/${c.id}`, { baseVersion: st.campaign.version, campaign: { subtitle: "teste" } });
    expect(sv.json.campaign.templateVersion).toBe(7);
    // troca explícita de modelo (sem versão) leva à versão publicada mais recente
    const sw = await A.api.post(`/api/campaigns/${c.id}/template`, { templateId: "feira-da-semana" });
    expect(sw.status).toBe(200);
    expect(sw.json.campaign.templateVersion).toBe(N);
    // trocar de modelo preserva produtos e preços
    const sw2 = await A.api.post(`/api/campaigns/${c.id}/template`, { templateId: "vitrine-clean" });
    expect(sw2.json.items.map((i: any) => [i.name, i.offer.priceCents])).toEqual([["Feijão 1kg", 749]]);
  });
});
