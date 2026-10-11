import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { clearAllRateLimits } from "@/server/auth/rate-limit";
import { createClientAccount, detachClient, enableAgencyMode } from "@/server/services/agency";
import { assertWritable, billingOverview, entitlements, setManualSubscription, startCheckout } from "@/server/services/subscriptions";
import { getOrgPlan, orgUsage, recordUsage, monthlyUsage } from "@/server/services/plans";
import type { TenantCtx } from "@/server/context";
import { addMember, makeOrg, type TestOrg } from "./helpers";

// Política "Agência paga": contas de clientes usam o plano e a assinatura da agência e somam no limite dela.
const db = () => getDb();
const ctxIn = (orgId: string, userId: string): TenantCtx => ({ userId, orgId, role: "admin", storeIds: null, isPlatformAdmin: false });

let AG: TestOrg;
let client: { id: string; storeId: string };

describe("agência paga pelas contas de clientes", () => {
  beforeAll(async () => {
    AG = await makeOrg({ plan: "redes", orgName: "Agência Cobrança" });
    await enableAgencyMode(AG.ctx);
    client = await createClientAccount(AG.ctx, { name: "Cliente Pago", storeName: "Loja Cliente" });
  });
  beforeEach(() => clearAllRateLimits());

  it("cliente não ganha assinatura própria e segue o plano da agência", async () => {
    const subs = await db().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, client.id));
    expect(subs).toHaveLength(0);
    const ent = await entitlements(client.id);
    expect(ent.paidByAgency).toEqual({ id: AG.orgId, name: "Agência Cobrança" });
    expect((await getOrgPlan(client.id)).id).toBe("redes");
    await db().update(schema.organizations).set({ planId: "profissional" }).where(eq(schema.organizations.id, AG.orgId));
    expect((await getOrgPlan(client.id)).id).toBe("profissional");
    await db().update(schema.organizations).set({ planId: "redes" }).where(eq(schema.organizations.id, AG.orgId));
  });

  it("lojas, pessoas e consumo somam no grupo da agência", async () => {
    const before = await orgUsage(AG.orgId);
    expect(before.stores).toBe(2); // loja da agência + loja do cliente
    expect(await orgUsage(client.id)).toEqual(before);
    await recordUsage(client.id, "ai_credit", 3);
    expect((await monthlyUsage(AG.orgId)).aiCreditsThisMonth).toBe(3);
    // limite de lojas do plano vale para o grupo
    await db().update(schema.plans).set({ limits: { ...(await getOrgPlan(AG.orgId)).limits, stores: 2 } }).where(eq(schema.plans.id, "redes"));
    try {
      await expect(createClientAccount(AG.ctx, { name: "Cliente Extra", storeName: "Loja Extra" })).rejects.toMatchObject({ code: "limit_reached" });
    } finally {
      await db().update(schema.plans).set({ limits: { ...(await getOrgPlan(AG.orgId)).limits, stores: 30 } }).where(eq(schema.plans.id, "redes"));
    }
  });

  it("assinatura da agência encerrada deixa o cliente somente leitura; cobrança própria é recusada", async () => {
    const [admin] = await db().select().from(schema.users).limit(1);
    await setManualSubscription(AG.orgId, { status: "encerrada" }, admin!.id);
    await expect(assertWritable(client.id)).rejects.toMatchObject({ code: "subscription_inactive" });
    await setManualSubscription(AG.orgId, { status: "ativa" }, admin!.id);
    await expect(assertWritable(client.id)).resolves.toBeUndefined();

    await expect(setManualSubscription(client.id, { planId: "inicial" }, admin!.id)).rejects.toMatchObject({ code: "validation" });
    await expect(startCheckout(ctxIn(client.id, AG.userId), { planId: "redes" })).rejects.toMatchObject({ code: "validation" });
    const ov = await billingOverview(ctxIn(client.id, AG.userId));
    expect(ov.paidByAgency?.id).toBe(AG.orgId);
    expect(ov.canManage).toBe(false);
  });

  it("ao desligar da agência o cliente passa a ter cobrança própria com período de teste", async () => {
    const own = await addMember({ ...AG, orgId: client.id, ctx: ctxIn(client.id, AG.userId) }, "admin");
    await detachClient(ctxIn(client.id, own.userId));
    const [sub] = await db().select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, client.id));
    expect(sub?.status).toMatch(/teste|ativa/);
    const ent = await entitlements(client.id);
    expect(ent.paidByAgency).toBeNull();
    expect((await orgUsage(client.id)).stores).toBe(1);
  });
});
