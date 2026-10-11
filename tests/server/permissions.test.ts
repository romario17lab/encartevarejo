import { describe, expect, it } from "vitest";
import { createCampaign, saveCampaign } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { createProduct } from "@/server/services/products";
import { createStore } from "@/server/services/stores";
import { createInvitation } from "@/server/services/members";
import * as approveRoute from "@/app/api/campaigns/[id]/approve/route";
import * as campaignRoute from "@/app/api/campaigns/[id]/route";
import * as publishRoute from "@/app/api/campaigns/[id]/publish/route";
import { addMember, call, days, makeOrg, makeProduct, req } from "./helpers";

async function draft() {
  const org = await makeOrg();
  const p = await makeProduct(org);
  const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "C", startsAt: days(0).toISOString(), endsAt: days(4).toISOString(), productIds: [p.id] });
  return { org, id: st.campaign.id, st };
}

describe("permissões por papel (servidor)", () => {
  it("editor não aprova nem publica; aprovador aprova e publica", async () => {
    const { org, id } = await draft();
    const editor = await addMember(org, "editor");
    const aprovador = await addMember(org, "aprovador");
    await transitionCampaign(editor.ctx, id, "submit");
    await expect(transitionCampaign(editor.ctx, id, "approve")).rejects.toMatchObject({ code: "forbidden" });
    const r = await call(approveRoute.POST, req("POST", `/api/campaigns/${id}/approve`, { token: editor.token }), { id });
    expect(r.status).toBe(403);
    expect(r.json.error.message).toMatch(/permissão/);
    const ok = await call(approveRoute.POST, req("POST", `/api/campaigns/${id}/approve`, { token: aprovador.token }), { id });
    expect(ok.status).toBe(200);
    expect(ok.json.campaign.status).toBe("aprovada");
    expect((await call(publishRoute.POST, req("POST", `/api/campaigns/${id}/publish`, { token: editor.token }), { id })).status).toBe(403);
    expect((await call(publishRoute.POST, req("POST", `/api/campaigns/${id}/publish`, { token: aprovador.token }), { id })).status).toBe(200);
  });

  it("aprovador não edita itens nem catálogo", async () => {
    const { org, id, st } = await draft();
    const aprovador = await addMember(org, "aprovador");
    await expect(saveCampaign(aprovador.ctx, id, { baseVersion: 1, items: st.items })).rejects.toMatchObject({ code: "forbidden" });
    const r = await call(campaignRoute.PUT, req("PUT", `/api/campaigns/${id}`, { token: aprovador.token, body: { baseVersion: 1, items: [] } }), { id });
    expect(r.status).toBe(403);
    await expect(createProduct(aprovador.ctx, { name: "x" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("editor não gerencia lojas nem membros", async () => {
    const { org } = await draft();
    const editor = await addMember(org, "editor");
    await expect(createStore(editor.ctx, { name: "Nova" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(createInvitation(editor.ctx, { email: "a@b.com", role: "editor" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("administrador único aprova a própria campanha; havendo outro aprovador, quem editou não aprova", async () => {
    const solo = await draft();
    await transitionCampaign(solo.org.ctx, solo.id, "submit");
    expect((await transitionCampaign(solo.org.ctx, solo.id, "approve")).campaign.status).toBe("aprovada");

    const team = await draft();
    const aprovador = await addMember(team.org, "aprovador");
    await expect(transitionCampaign(team.org.ctx, team.id, "approve")).rejects.toMatchObject({ code: "forbidden" });
    expect((await transitionCampaign(aprovador.ctx, team.id, "approve")).campaign.status).toBe("aprovada");
  });

  it("reprovar exige motivo e volta para rascunho", async () => {
    const { org, id } = await draft();
    const aprovador = await addMember(org, "aprovador");
    await transitionCampaign(org.ctx, id, "submit");
    await expect(transitionCampaign(aprovador.ctx, id, "reject", {})).rejects.toBeTruthy();
    const r = await transitionCampaign(aprovador.ctx, id, "reject", { note: "Preço do arroz errado" });
    expect(r.campaign.status).toBe("rascunho");
  });

  it("publicar exige aprovação", async () => {
    const { org, id } = await draft();
    await expect(transitionCampaign(org.ctx, id, "publish")).rejects.toMatchObject({ code: "conflict" });
    await expect(transitionCampaign(org.ctx, id, "schedule", { at: days(1).toISOString() })).rejects.toMatchObject({ code: "conflict" });
  });
});
