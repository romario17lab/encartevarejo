import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { createStore, updateStore, deleteStore } from "@/server/services/stores";
import { createInvitation, acceptInvitation, lookupInvitation, listMembers, updateMember, removeMember } from "@/server/services/members";
import { exportOrg, deleteOrg } from "@/server/services/org";
import { listDevEmails } from "@/server/email";
import { getTenantCtx } from "@/server/auth/session";
import * as storesRoute from "@/app/api/stores/route";
import * as meRoute from "@/app/api/me/route";
import { addMember, call, makeOrg, makeProduct, req, uid, PASSWORD } from "./helpers";

const tokenFrom = (text: string) => decodeURIComponent(text.match(/token=([^\s]+)/)![1]!);

describe("lojas e limites do plano", () => {
  it("plano inicial permite 1 loja: segunda é recusada com limit_reached", async () => {
    const org = await makeOrg();
    await expect(createStore(org.ctx, { name: "Filial 2" })).rejects.toMatchObject({ code: "limit_reached" });
    const r = await call(storesRoute.POST, req("POST", "/api/stores", { token: org.token, body: { name: "Filial 2" } }));
    expect(r.status).toBe(402);
    expect(r.json.error.code).toBe("limit_reached");
    expect(r.json.error.message).toMatch(/permite até 1 loja/);
  });

  it("slug único a partir do nome e validação de contatos", async () => {
    const org = await makeOrg({ plan: "profissional" });
    const name = `Supermercado São José ${uid()}`;
    const a = await createStore(org.ctx, { name, whatsapp: "(11) 98888-7777", address: { state: "sp", zip: "01001-000" }, socials: { instagram: "https://instagram.com/mercado.sj" }, hours: { "1": "07:00-21:00", "0": null } });
    expect(a.slug).toMatch(/^supermercado-sao-jose-/);
    expect(a.whatsapp).toBe("5511988887777");
    expect(a.address).toMatchObject({ state: "SP", zip: "01001000" });
    expect(a.socials).toMatchObject({ instagram: "mercado.sj" });
    const b = await createStore(org.ctx, { name });
    expect(b.slug).toBe(`${a.slug}-2`);
    await expect(updateStore(org.ctx, b.id, { slug: a.slug })).rejects.toMatchObject({ code: "conflict" });
    await expect(updateStore(org.ctx, b.id, { whatsapp: "123" })).rejects.toBeTruthy();
    await expect(updateStore(org.ctx, b.id, { hours: { "1": "21:00-07:00" } })).rejects.toBeTruthy();
    await expect(updateStore(org.ctx, b.id, { address: { state: "XX" } })).rejects.toBeTruthy();
    await deleteStore(org.ctx, b.id);
    await deleteStore(org.ctx, a.id);
    await expect(deleteStore(org.ctx, org.storeId)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("convites e membros", () => {
  it("convite para usuário novo: e-mail na caixa de saída, aceite cria conta e vínculo", async () => {
    const org = await makeOrg();
    const email = `novo-${uid()}@teste.com`;
    await createInvitation(org.ctx, { email, role: "editor" });
    const [mail] = await listDevEmails({ to: email });
    const token = tokenFrom(mail!.text);
    const info = await lookupInvitation(token);
    expect(info).toMatchObject({ email, role: "editor", userExists: false });
    await expect(acceptInvitation({ token, name: "Novo", password: "123" }, null)).rejects.toBeTruthy();
    const r = await acceptInvitation({ token, name: "Novo Editor", password: PASSWORD }, null);
    expect(r.token).toBeTruthy();
    const ctx = await getTenantCtx(req("GET", "/", { token: r.token }));
    expect(ctx).toMatchObject({ orgId: org.orgId, role: "editor" });
    await expect(acceptInvitation({ token, name: "Outra Pessoa", password: PASSWORD }, null)).rejects.toMatchObject({ code: "not_found" });
  });

  it("convite para usuário existente exige a senha (ou sessão com o mesmo e-mail)", async () => {
    const org = await makeOrg();
    const other = await makeOrg();
    await createInvitation(org.ctx, { email: other.email, role: "aprovador" });
    const token = tokenFrom((await listDevEmails({ to: other.email }))[0]!.text);
    expect((await lookupInvitation(token)).userExists).toBe(true);
    await expect(acceptInvitation({ token, password: "errada-123" }, null)).rejects.toMatchObject({ code: "unauthenticated" });
    const intruder = await makeOrg();
    await expect(acceptInvitation({ token }, { userId: intruder.userId, email: intruder.email, name: "x", isPlatformAdmin: false })).rejects.toMatchObject({ code: "forbidden" });
    const r = await acceptInvitation({ token }, { userId: other.userId, email: other.email, name: "x", isPlatformAdmin: false });
    expect(r.token).toBeNull();
    const me = await call(meRoute.GET, req("GET", "/api/me", { token: other.token }));
    expect(me.json.orgs).toHaveLength(2);
  });

  it("limite de usuários conta convites pendentes; último admin é protegido", async () => {
    const org = await makeOrg(); // inicial: 2 usuários
    await createInvitation(org.ctx, { email: `a-${uid()}@t.com`, role: "editor" });
    await expect(createInvitation(org.ctx, { email: `b-${uid()}@t.com`, role: "editor" })).rejects.toMatchObject({ code: "limit_reached" });
    await expect(updateMember(org.ctx, org.userId, { role: "editor" })).rejects.toMatchObject({ code: "validation" });
    await expect(removeMember(org.ctx, org.userId)).rejects.toMatchObject({ code: "validation" });
  });

  it("papel é lido do banco a cada requisição", async () => {
    const org = await makeOrg({ plan: "profissional" });
    const m = await addMember(org, "editor");
    expect((await getTenantCtx(req("GET", "/", { token: m.token }))).role).toBe("editor");
    await updateMember(org.ctx, m.userId, { role: "aprovador", storeIds: [org.storeId] });
    expect(await getTenantCtx(req("GET", "/", { token: m.token }))).toMatchObject({ role: "aprovador", storeIds: [org.storeId] });
    await removeMember(org.ctx, m.userId);
    await expect(getTenantCtx(req("GET", "/", { token: m.token }))).rejects.toMatchObject({ code: "forbidden" });
    expect((await listMembers(org.ctx)).length).toBe(1);
  });
});

describe("exportação e exclusão da conta", () => {
  it("exportação inclui custos do dono e nunca hashes de senha/tokens", async () => {
    const org = await makeOrg();
    await makeProduct(org, { name: "Com custo", costCents: 321 });
    const data = await exportOrg(org.ctx);
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/passwordHash|password_hash|tokenHash|\$2[aby]\$/);
    expect(data.products[0]!.costCents).toBe(321);
    expect(data.members[0]!.email).toBe(org.email);
    const editor = await addMember(org, "editor");
    await expect(exportOrg(editor.ctx)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("exclusão exige digitar o nome e desativa a conta", async () => {
    const org = await makeOrg({ orgName: `Conta Apagar ${uid()}` });
    const [o] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, org.orgId));
    await expect(deleteOrg(org.ctx, { confirmName: "errado" })).rejects.toMatchObject({ code: "validation" });
    await deleteOrg(org.ctx, { confirmName: o!.name });
    await expect(getTenantCtx(req("GET", "/", { token: org.token }))).rejects.toMatchObject({ code: "forbidden" });
    const [after] = await getDb().select().from(schema.organizations).where(eq(schema.organizations.id, org.orgId));
    expect(after!.deletedAt).not.toBeNull();
  });
});
