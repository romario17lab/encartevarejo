import { expect, test, type APIRequestContext } from "@playwright/test";

// Editor: desfazer/refazer, conflito de edição (409) e recuperação de rascunho local.
async function setup(request: APIRequestContext) {
  const email = `editor-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
  expect((await request.post("/api/auth/signup", { data: { name: "Editor Teste", email, password: "senha-segura-123", orgName: "Mercado Editor", storeName: "Mercado Editor", segment: "supermercado" } })).ok()).toBeTruthy();
  const me = await (await request.get("/api/me")).json();
  const ids: string[] = [];
  for (const [name, price] of [["Café torrado 500g", 1590], ["Açúcar refinado 1kg", 489]] as const) {
    const p = await (await request.post("/api/products", { data: { name, unit: "pct", regularCents: price } })).json();
    ids.push(p.id ?? p.product.id);
  }
  const tpl = (await (await request.get("/api/templates")).json()).templates[0];
  const st = await (await request.post("/api/campaigns", { data: { storeId: me.stores[0].id, name: "Campanha editor", templateId: tpl.id, productIds: ids } })).json();
  return st.campaign.id as string;
}

test("desfazer, conflito e rascunho", async ({ page }, info) => {
  test.skip(info.project.name.startsWith("celular"), "fluxo coberto no desktop");
  const id = await setup(page.request);
  await page.goto(`/app/campanhas/${id}`);
  await expect(page.locator("[data-ev-render]").first()).toBeVisible({ timeout: 60_000 });

  // desfazer / refazer
  const title = page.getByLabel("Título no material");
  await title.fill("Super Ofertas");
  await expect(page.getByText(/Salvo às/)).toBeVisible();
  await page.getByRole("button", { name: /^Desfazer/ }).click();
  await expect(title).toHaveValue("Ofertas da Semana");
  await page.getByRole("button", { name: /^Refazer/ }).click();
  await expect(title).toHaveValue("Super Ofertas");
  await expect(page.getByText(/Salvo às/)).toBeVisible();

  // conflito: outra "aba" salva antes
  const st = await (await page.request.get(`/api/campaigns/${id}`)).json();
  expect((await page.request.put(`/api/campaigns/${id}`, { data: { baseVersion: st.campaign.version, campaign: { subtitle: "Mudado em outra aba" } } })).ok()).toBeTruthy();
  await title.fill("Ofertas do Mês");
  const dlg = page.getByRole("dialog", { name: "Outra pessoa alterou esta campanha" });
  await expect(dlg).toBeVisible();
  await page.screenshot({ path: "e2e-output/40-conflito-1280.png" });
  await dlg.getByRole("button", { name: "Manter as minhas como cópia" }).click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(page.getByLabel("Título no material")).toHaveValue("Ofertas do Mês");

  // rascunho local (aba fechada antes de salvar)
  const copyUrl = page.url();
  const copyId = copyUrl.split("/").pop()!.split("?")[0];
  const copy = await (await page.request.get(`/api/campaigns/${copyId}`)).json();
  await page.evaluate(([cid, c]) => {
    const doc = { campaign: { ...c.campaign, title: "Rascunho perdido" }, items: c.items, pieces: c.pieces };
    localStorage.setItem(`ev.draft.${cid}`, JSON.stringify({ baseVersion: c.campaign.version, doc, at: new Date().toISOString() }));
  }, [copyId, copy] as const);
  await page.reload();
  const rec = page.getByRole("dialog", { name: "Recuperar alterações não salvas?" });
  await expect(rec).toBeVisible();
  await rec.getByRole("button", { name: "Recuperar" }).click();
  await expect(page.getByLabel("Título no material")).toHaveValue("Rascunho perdido");
  await expect(page.getByText(/Salvo às/)).toBeVisible();

  // fluxo: enviar para revisão
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await expect(page.getByText("Em revisão").first()).toBeVisible();
  await page.screenshot({ path: "e2e-output/41-em-revisao-1280.png" });
});
