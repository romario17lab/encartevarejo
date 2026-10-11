import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { sha256 } from "@/server/signing";
import * as signupRoute from "@/app/api/auth/signup/route";
import * as loginRoute from "@/app/api/auth/login/route";
import * as logoutRoute from "@/app/api/auth/logout/route";
import * as forgotRoute from "@/app/api/auth/forgot/route";
import * as resetRoute from "@/app/api/auth/reset/route";
import * as meRoute from "@/app/api/me/route";
import * as devEmails from "@/app/api/dev/emails/route";
import { call, ready, req, uid, PASSWORD } from "./helpers";

function cookieToken(res: Response): string | null {
  const sc = res.headers.get("set-cookie") ?? "";
  const m = sc.match(/ev_session=([^;]*)/);
  return m ? m[1]! : null;
}

describe("autenticação", () => {
  beforeAll(ready);
  const email = `joao-${uid()}@teste.com`;
  let token: string;

  it("cadastro cria conta, loja, sessão e cookie httpOnly", async () => {
    const r = await call(signupRoute.POST, req("POST", "/api/auth/signup", { body: { name: "João", email, password: PASSWORD, orgName: "Mercado do João", storeName: "Loja Centro", segment: "supermercado" } }));
    expect(r.status).toBe(201);
    const sc = r.res.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=lax/i);
    token = cookieToken(r.res)!;
    expect(token.length).toBeGreaterThan(30);
    // banco guarda apenas o sha256 do token
    const [s] = await getDb().select().from(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
    expect(s).toBeTruthy();
    const [u] = await getDb().select().from(schema.users).where(eq(schema.users.email, email));
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const me = await call(meRoute.GET, req("GET", "/api/me", { token }));
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe(email);
    expect(me.json.role).toBe("admin");
    expect(me.json.org.name).toBe("Mercado do João");
    expect(me.json.stores).toHaveLength(1);
    expect(me.json.permissions).toContain("campaigns.approve");
  });

  it("e-mail duplicado é recusado", async () => {
    const r = await call(signupRoute.POST, req("POST", "/api/auth/signup", { body: { name: "Xavier", email: email.toUpperCase(), password: PASSWORD, orgName: "Outro", storeName: "Loja" } }));
    expect(r.status).toBe(409);
  });

  it("senha curta é recusada com mensagem em português", async () => {
    const r = await call(signupRoute.POST, req("POST", "/api/auth/signup", { body: { name: "Xavier", email: `x-${uid()}@t.com`, password: "123", orgName: "Outro", storeName: "Loja" } }));
    expect(r.status).toBe(422);
  });

  it("login com senha errada falha; certa funciona; logout invalida a sessão", async () => {
    const bad = await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email, password: "errada-123" } }));
    expect(bad.status).toBe(401);
    expect(bad.json.error.message).toBe("E-mail ou senha incorretos.");
    const unknown = await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email: `ninguem-${uid()}@t.com`, password: "errada-123" } }));
    expect(unknown.status).toBe(401);
    expect(unknown.json.error.message).toBe(bad.json.error.message);
    const ok = await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email, password: PASSWORD } }));
    expect(ok.status).toBe(200);
    const t2 = cookieToken(ok.res)!;
    expect((await call(meRoute.GET, req("GET", "/api/me", { token: t2 }))).status).toBe(200);
    const out = await call(logoutRoute.POST, req("POST", "/api/auth/logout", { token: t2 }));
    expect(out.status).toBe(200);
    expect(out.res.headers.get("set-cookie")).toMatch(/Max-Age=0/i);
    expect((await call(meRoute.GET, req("GET", "/api/me", { token: t2 }))).status).toBe(401);
    expect((await call(meRoute.GET, req("GET", "/api/me", { token }))).status).toBe(200);
  });

  it("limita tentativas de login por IP + e-mail", async () => {
    const e = `rl-${uid()}@t.com`;
    const headers = { "x-forwarded-for": "10.9.9.9" };
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email: e, password: "qualquer-123" }, headers }))).status;
    expect(last).toBe(429);
  }, 120_000);

  it("esqueci a senha: mesma resposta para e-mail existente ou não; link de uso único", async () => {
    const a = await call(forgotRoute.POST, req("POST", "/api/auth/forgot", { body: { email } }));
    const b = await call(forgotRoute.POST, req("POST", "/api/auth/forgot", { body: { email: `nao-existe-${uid()}@t.com` } }));
    expect(a.status).toBe(200);
    expect(a.json).toEqual(b.json);
    const mails = await call(devEmails.GET, req("GET", `/api/dev/emails?to=${encodeURIComponent(email)}`));
    expect(mails.status).toBe(200);
    const text: string = mails.json.emails[0].text;
    const resetToken = decodeURIComponent(text.match(/token=([^\s]+)/)![1]!);
    const r = await call(resetRoute.POST, req("POST", "/api/auth/reset", { body: { token: resetToken, password: "nova-senha-456" } }));
    expect(r.status).toBe(200);
    // sessões antigas foram encerradas
    expect((await call(meRoute.GET, req("GET", "/api/me", { token }))).status).toBe(401);
    // reutilizar o link falha
    const again = await call(resetRoute.POST, req("POST", "/api/auth/reset", { body: { token: resetToken, password: "outra-senha-789" } }));
    expect(again.status).toBe(422);
    expect((await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email, password: PASSWORD } }))).status).toBe(401);
    expect((await call(loginRoute.POST, req("POST", "/api/auth/login", { body: { email, password: "nova-senha-456" } }))).status).toBe(200);
  });

  it("link expirado não funciona", async () => {
    await call(forgotRoute.POST, req("POST", "/api/auth/forgot", { body: { email } }));
    const mails = await call(devEmails.GET, req("GET", `/api/dev/emails?to=${encodeURIComponent(email)}`));
    const t = decodeURIComponent(mails.json.emails[0].text.match(/token=([^\s]+)/)![1]!);
    await getDb().update(schema.passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.passwordResets.id, sha256(t)));
    const r = await call(resetRoute.POST, req("POST", "/api/auth/reset", { body: { token: t, password: "mais-uma-senha-1" } }));
    expect(r.status).toBe(422);
  });

  it("sem cookie: 401", async () => {
    expect((await call(meRoute.GET, req("GET", "/api/me"))).status).toBe(401);
    expect((await call(meRoute.GET, req("GET", "/api/me", { token: "x".repeat(43) }))).status).toBe(401);
  });
});
