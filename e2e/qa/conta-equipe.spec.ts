// Fluxos de conta: convite → aceite, troca de papel, recuperação de senha pelo link do e-mail
// (caixa de saída), exportação dos dados da conta. Rodado em 390 px e desktop.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { apiProduct, apiSignup, assertFits, ip, rnd, shot, sql } from "./util";

test("convite, papel, senha e exportação de dados", async ({ page, browser }, info) => {
  const P = info.project.name;
  page.on("dialog", (d) => void d.accept());
  const admin = await apiSignup(page.request, P.startsWith("celular") ? "conta390" : "contadesk");
  await apiProduct(page.request, { name: "Produto da conta", regularCents: 1234, costCents: 800 });

  // ---------- convite ----------
  await page.goto("/app/equipe");
  const guest = `convidado-${Date.now()}-${rnd()}@exemplo.com`;
  await page.getByLabel("E-mail").fill(guest);
  await page.getByLabel("Papel").selectOption("editor");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/Convite enviado/)).toBeVisible();
  await assertFits(page, "equipe");
  await shot(page, "qa-20-equipe-convite", P);
  const link = await page.getByRole("link", { name: /\/convite\?token=/ }).getAttribute("href");
  expect(link).toBeTruthy();
  const out = await sql("select text_body from email_outbox where to_email=$1", [guest]);
  expect(out[0].text_body).toContain("convite");

  const ctx2 = await browser.newContext({ ...(info.project.use as object), extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const p2 = await ctx2.newPage();
  await p2.goto(link!.replace(/^https?:\/\/[^/]+/, ""));
  await p2.getByRole("radio", { name: /Não|criar|Sou novo|primeira/i }).first().click().catch(() => undefined);
  await p2.getByLabel("Seu nome").fill("Pessoa Convidada");
  await p2.getByLabel("Crie uma senha").fill("senha-convidado-123");
  await assertFits(p2, "aceitar convite");
  await shot(p2, "qa-21-aceitar-convite", P);
  await p2.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(p2).toHaveURL(/\/app/);
  const me2 = await (await p2.request.get("/api/me")).json();
  expect(me2.org.id).toBe(admin.me.org.id);
  expect(me2.role).toBe("editor");
  // editor não aprova
  expect(me2.permissions).not.toContain("campaigns.approve");

  // ---------- troca de papel ----------
  await page.reload();
  const sel = page.getByLabel("Papel de Pessoa Convidada");
  await sel.selectOption("aprovador");
  await expect.poll(async () => (await (await p2.request.get("/api/me")).json()).role, { timeout: 15_000 }).toBe("aprovador");
  const members = (await (await page.request.get("/api/members")).json()).members;
  expect(members.find((m: any) => m.email === guest).role).toBe("aprovador");
  // aprovador não pode mudar papéis
  const forb = await p2.request.patch(`/api/members/${admin.me.user.id}`, { data: { role: "editor" } });
  expect(forb.status()).toBe(403);
  await ctx2.close();

  // ---------- recuperação de senha ----------
  const ctx3 = await browser.newContext({ ...(info.project.use as object), extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const p3 = await ctx3.newPage();
  await p3.goto("/esqueci-senha");
  await p3.getByLabel("E-mail").fill(admin.email);
  await p3.getByRole("button", { name: "Enviar link" }).click();
  await expect(p3.getByText(/Se o e-mail estiver cadastrado|enviamos|Confira/i).first()).toBeVisible();
  // em produção /api/dev/emails fica desligado (404): o link é lido da caixa de saída no banco
  expect((await p3.request.get("/api/dev/emails")).status()).toBe(404);
  const mails = await sql("select text_body from email_outbox where to_email=$1 and text_body like '%redefinir-senha%' order by created_at desc", [admin.email]);
  const resetUrl = /https?:\/\/\S+redefinir-senha\?token=\S+/.exec(mails[0].text_body)![0];
  await p3.goto(resetUrl.replace(/^https?:\/\/[^/]+/, ""));
  await p3.getByLabel("Nova senha", { exact: false }).first().fill("nova-senha-forte-456");
  await p3.getByLabel("Repita a nova senha").fill("nova-senha-forte-456");
  await assertFits(p3, "redefinir senha");
  await shot(p3, "qa-22-redefinir-senha", P);
  await p3.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(p3).toHaveURL(/\/entrar/);
  const bad = await p3.request.post("/api/auth/login", { data: { email: admin.email, password: "senha-segura-123" } });
  expect(bad.status()).toBeGreaterThanOrEqual(400);
  const good = await p3.request.post("/api/auth/login", { data: { email: admin.email, password: "nova-senha-forte-456" } });
  expect(good.ok()).toBeTruthy();
  // link usado não vale de novo
  const token = new URL(resetUrl).searchParams.get("token");
  expect((await p3.request.post("/api/auth/reset", { data: { token, password: "outra-senha-789xyz" } })).status()).toBeGreaterThanOrEqual(400);
  await ctx3.close();

  // ---------- exportação dos dados da conta ----------
  // a redefinição de senha encerra as sessões abertas: a sessão antiga do admin precisa cair
  expect((await page.request.get("/api/me")).status()).toBe(401);
  expect((await page.request.post("/api/auth/login", { headers: { "x-forwarded-for": ip() }, data: { email: admin.email, password: "nova-senha-forte-456" } })).ok()).toBeTruthy();
  await page.goto("/app/conta");
  await page.waitForLoadState("networkidle");
  await assertFits(page, "conta");
  await shot(page, "qa-23-conta", P);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar meus dados" }).click();
  const file = await dl;
  const data = JSON.parse(readFileSync((await file.path())!, "utf8"));
  const txt = JSON.stringify(data);
  expect(txt).toContain("Produto da conta");
  expect(txt).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  expect(txt).not.toContain(admin.me.org.id === "x" ? "x" : "ev_session");
});
