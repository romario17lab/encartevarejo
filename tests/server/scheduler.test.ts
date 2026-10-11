import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createCampaign, getEditorState, saveCampaign } from "@/server/services/campaigns";
import { transitionCampaign } from "@/server/services/campaign-workflow";
import { runCampaignScheduler } from "@/server/services/scheduler";
import { getStorefront } from "@/server/services/storefront";
import { days, makeOrg, makeProduct } from "./helpers";

async function approved(startOffset = 0, endOffset = 5) {
  const org = await makeOrg();
  const p = await makeProduct(org);
  const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Agendada", startsAt: days(startOffset).toISOString(), endsAt: days(endOffset).toISOString(), productIds: [p.id] });
  await transitionCampaign(org.ctx, st.campaign.id, "approve");
  return { org, id: st.campaign.id };
}

describe("agendador de campanhas", () => {
  it("publica no horário agendado (idempotente e seguro em paralelo)", async () => {
    const { org, id } = await approved();
    const at = new Date(Date.now() + 3600_000);
    const s = await transitionCampaign(org.ctx, id, "schedule", { at: at.toISOString() });
    expect(s.campaign.status).toBe("agendada");
    // antes do horário: nada
    await runCampaignScheduler(new Date());
    expect((await getEditorState(org.ctx, id)).campaign.status).toBe("agendada");
    // várias execuções simultâneas depois do horário: publica exatamente uma vez
    const later = new Date(at.getTime() + 60_000);
    const results = await Promise.all([runCampaignScheduler(later), runCampaignScheduler(later), runCampaignScheduler(later)]);
    const mine = (await getEditorState(org.ctx, id)).campaign;
    expect(mine.status).toBe("publicada");
    expect(mine.publishedVersion).toBe(1);
    expect(results.reduce((n, r) => n + r.published, 0)).toBeGreaterThanOrEqual(1);
    const audits = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));
    expect(audits.filter((a) => a.action === "campaign.publish")).toHaveLength(1);
    const slug = (await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId)))[0]!.slug;
    expect((await getStorefront(slug, later))!.campaigns).toHaveLength(1);
  });

  it("não publica se o conteúdo mudou depois da aprovação (volta para rascunho)", async () => {
    const { org, id } = await approved();
    await transitionCampaign(org.ctx, id, "schedule", { at: new Date(Date.now() + 1000).toISOString() });
    // força divergência de hash sem passar pelo salvamento (simula corrida)
    await getDb().update(schema.campaigns).set({ contentHash: "outro" }).where(eq(schema.campaigns.id, id));
    await runCampaignScheduler(new Date(Date.now() + 120_000));
    const c = (await getEditorState(org.ctx, id)).campaign;
    expect(c.status).toBe("rascunho");
    expect(c.publishedVersion).toBeNull();
  });

  it("salvar mudança de preço numa campanha agendada cancela o agendamento", async () => {
    const { org, id } = await approved();
    const s = await transitionCampaign(org.ctx, id, "schedule", { at: new Date(Date.now() + 3600_000).toISOString() });
    const items = s.items.map((i) => ({ ...i, offer: { ...i.offer, priceCents: 555 } }));
    const saved = await saveCampaign(org.ctx, id, { baseVersion: s.campaign.version, items });
    expect(saved.campaign.status).toBe("rascunho");
    expect(saved.campaign.scheduledPublishAt).toBeNull();
  });

  it("encerra campanhas vencidas e tira da vitrine", async () => {
    const { org, id } = await approved(-2, 1);
    await transitionCampaign(org.ctx, id, "publish");
    const future = days(2);
    const r = await runCampaignScheduler(future);
    expect(r.ended).toBeGreaterThanOrEqual(1);
    expect((await getEditorState(org.ctx, id)).campaign.status).toBe("encerrada");
    const again = await runCampaignScheduler(future);
    expect(again.ended).toBe(0);
    const slug = (await getDb().select().from(schema.stores).where(eq(schema.stores.id, org.storeId)))[0]!.slug;
    expect((await getStorefront(slug, new Date()))!.campaigns).toHaveLength(0);
  });

  it("rascunho vencido sem publicação não é alterado", async () => {
    const org = await makeOrg();
    const p = await makeProduct(org);
    const st = await createCampaign(org.ctx, { storeId: org.storeId, name: "Rasc", startsAt: days(-3).toISOString(), endsAt: days(-1).toISOString(), productIds: [p.id] });
    await runCampaignScheduler();
    expect((await getEditorState(org.ctx, st.campaign.id)).campaign.status).toBe("rascunho");
  });
});
