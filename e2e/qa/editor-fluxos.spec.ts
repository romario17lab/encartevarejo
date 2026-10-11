// Critérios 1 (criar, salvar, reabrir e editar — 390 px e desktop), 6 (prévia do editor × PNG exportado),
// 8 (390 px) e fluxos que só tinham verificação de tipos: aprovar/reprovar/publicar/agendar/tirar/encerrar,
// troca de modelo, restauração de versão, "mover para a posição" e controles de enquadramento da foto.
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import JSZip from "jszip";
import { apiProduct, apiSignup, apiUpload, assertFits, photo, shot, SHOTS } from "./util";

const editorState = async (page: Page, id: string) => (await page.request.get(`/api/campaigns/${id}`)).json();
const waitSaved = (page: Page) => expect(page.getByText(/Salvo às \d\d:\d\d/).first()).toBeVisible({ timeout: 30_000 });

test("criar, salvar, reabrir, editar e publicar uma campanha pela interface", async ({ page }, info) => {
  const P = info.project.name;
  const mobile = P.startsWith("celular");
  page.on("dialog", (d) => void d.accept());
  const { me } = await apiSignup(page.request, mobile ? "ui390" : "uidesk");
  const slug = me.stores[0].slug as string;
  const img = await apiUpload(page.request, await photo(1200, 400, "#c1121f"), "larga.jpg");
  await apiProduct(page.request, { name: "Contra-filé bovino", unit: "kg", regularCents: 4990, promoCents: 3990, imageAssetId: img.id });
  await apiProduct(page.request, { name: "Tomate italiano", unit: "kg", regularCents: 699 });
  await apiProduct(page.request, { name: "Óleo de soja 900ml", unit: "un", regularCents: 799 });

  // ---------- criar (assistente) ----------
  await page.goto("/app/campanhas/nova");
  await page.waitForLoadState("networkidle");
  await assertFits(page, "nova campanha – modelos");
  await page.getByRole("radiogroup", { name: "Modelos" }).getByRole("radio").first().click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Selecionar os 3 visíveis/ }).click();
  await assertFits(page, "nova campanha – produtos");
  await page.getByRole("button", { name: "Revisar ofertas" }).click();
  await page.getByLabel("Nome interno da campanha").fill("Campanha QA interface");
  await assertFits(page, "nova campanha – revisão");
  await shot(page, "qa-01-revisao", P);
  await page.getByRole("button", { name: "Gerar campanha" }).click();
  await expect(page).toHaveURL(/\/app\/campanhas\/cmp_[a-z0-9]+/, { timeout: 120_000 });
  const id = page.url().split("/").pop()!.split("?")[0]!;
  await expect(page.locator("[data-ev-render]").first()).toBeVisible({ timeout: 60_000 });
  await assertFits(page, "editor");
  await shot(page, "qa-02-editor", P);

  // ---------- editar preço → salvamento automático ----------
  const openItem = async (name: RegExp) => {
    if (mobile) await page.getByRole("tab", { name: /^Produtos \(\d+\)/ }).click();
    await page.getByRole("button", { name }).first().click();
    return mobile ? page.getByRole("dialog") : page.getByRole("complementary", { name: "Propriedades" });
  };
  let scope = await openItem(/Tomate italiano.*R\$/);
  await scope.getByLabel(/^Preço( \*)?$/).fill("589");
  await expect(scope.getByLabel(/^Preço( \*)?$/)).toHaveValue("5,89");
  // mover para a posição 1
  await scope.getByLabel(/Mover para a posição/).fill("1");
  await scope.getByRole("button", { name: "Mover", exact: true }).click();
  if (mobile) await assertFits(page, "editor – item (folha)");
  if (mobile) await shot(page, "qa-03-item", P);
  if (mobile) await scope.getByRole("button", { name: "Fechar" }).click();
  await waitSaved(page);
  let st = await editorState(page, id);
  expect(st.items.map((i: any) => i.name)[0]).toBe("Tomate italiano");
  expect(st.items[0].offer.priceCents).toBe(589);

  // ---------- enquadramento da foto (controles deslizantes) ----------
  scope = await openItem(/Contra-filé bovino.*R\$/);
  await scope.getByLabel("Posição horizontal").fill("80");
  await scope.getByLabel("Zoom").fill("1.5");
  if (mobile) await scope.getByRole("button", { name: "Fechar" }).click();
  await waitSaved(page);
  st = await editorState(page, id);
  expect(st.items.find((i: any) => i.name === "Contra-filé bovino").imageFit).toEqual({ x: 80, y: 50, zoom: 1.5 });

  // ---------- reabrir pela lista ----------
  await page.goto("/app/campanhas");
  await assertFits(page, "lista de campanhas");
  await shot(page, "qa-04-campanhas", P);
  await page.getByRole("link", { name: /Campanha QA interface/ }).first().click();
  await expect(page).toHaveURL(new RegExp(id));
  if (mobile) await page.getByRole("tab", { name: /^Produtos \(\d+\)/ }).click();
  await expect(page.getByRole("button", { name: /Tomate italiano.*R\$/ })).toContainText("R$ 5,89");

  // ---------- troca de modelo ----------
  if (mobile) { await page.getByRole("button", { name: "Mais ações" }).click(); await page.getByRole("dialog", { name: "Ações" }).getByRole("button", { name: "Trocar modelo" }).click(); }
  else { await page.getByRole("tab", { name: "Campanha" }).click(); await page.getByRole("complementary", { name: "Propriedades" }).getByRole("button", { name: "Trocar modelo" }).click(); }
  const dlg = page.getByRole("dialog", { name: "Trocar modelo" });
  await dlg.getByRole("radio", { name: /Vitrine Clean/ }).click();
  await expect.poll(async () => (await editorState(page, id)).campaign.templateId, { timeout: 30_000 }).toBe("vitrine-clean");
  if (await dlg.isVisible()) await page.keyboard.press("Escape");
  st = await editorState(page, id);
  expect(st.items.find((i: any) => i.name === "Tomate italiano").offer.priceCents).toBe(589);
  await page.waitForTimeout(800);
  await shot(page, "qa-05-modelo-trocado", P);

  // ---------- restaurar versão ----------
  const versionsBefore = (await (await page.request.get(`/api/campaigns/${id}/versions`)).json()).versions.length;
  if (mobile) { await page.getByRole("button", { name: "Mais ações" }).click(); await page.getByRole("dialog", { name: "Ações" }).getByRole("button", { name: "Histórico de versões" }).click(); }
  else await page.getByRole("button", { name: "Histórico de versões" }).click();
  const vd = page.getByRole("dialog", { name: "Histórico de versões" });
  await expect(vd.getByText("Versão 1", { exact: false }).first()).toBeVisible();
  await assertFits(page, "histórico de versões");
  await shot(page, "qa-06-versoes", P);
  await vd.locator("li", { hasText: /^Versão 1\b/ }).getByRole("button", { name: "Restaurar" }).click();
  await expect.poll(async () => (await editorState(page, id)).campaign.templateId, { timeout: 30_000 }).toBe("feira-da-semana");
  st = await editorState(page, id);
  expect(st.items.find((i: any) => i.name === "Tomate italiano").offer.priceCents).toBe(699); // preço da versão 1
  expect((await (await page.request.get(`/api/campaigns/${id}/versions`)).json()).versions.length).toBeGreaterThan(versionsBefore);
  await page.reload();
  await expect(page.locator("header").getByRole("button", { name: "Enviar para revisão" })).toBeVisible({ timeout: 60_000 });

  // ---------- fluxo de aprovação pela interface ----------
  const bar = page.locator("header");
  const act = async (name: string, toast: RegExp) => { await bar.getByRole("button", { name, exact: true }).click(); await expect(page.getByText(toast).first()).toBeVisible(); };
  await act("Enviar para revisão", /Enviada para revisão/);
  await bar.getByRole("button", { name: "Reprovar", exact: true }).click();
  const rj = page.getByRole("dialog");
  await rj.getByLabel(/Motivo/).fill("Preço do tomate precisa ser conferido.");
  await assertFits(page, "diálogo reprovar");
  await rj.getByRole("button", { name: "Reprovar" }).click();
  await expect(page.getByText(/devolvida para edição/).first()).toBeVisible();
  expect((await editorState(page, id)).campaign.status).toBe("rascunho");
  await act("Enviar para revisão", /Enviada para revisão/);
  await act("Aprovar", /Campanha aprovada/);
  expect((await editorState(page, id)).campaign.status).toBe("aprovada");
  // agendar
  await bar.getByRole("button", { name: "Agendar", exact: true }).click();
  const sd = page.getByRole("dialog");
  const t = new Date(Date.now() + 2 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await sd.getByLabel("Publicar em").fill(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`);
  await sd.getByRole("button", { name: "Agendar" }).click();
  await expect(page.getByText(/Publicação agendada/).first()).toBeVisible();
  expect((await editorState(page, id)).campaign.status).toBe("agendada");
  await shot(page, "qa-07-agendada", P);
  await act("Publicar", /Campanha publicada/);
  let sf = await (await page.request.get(`/api/storefront/${slug}`)).json();
  expect(sf.campaigns).toHaveLength(1);
  await act("Tirar da vitrine", /retirada da vitrine/);
  sf = await (await page.request.get(`/api/storefront/${slug}`)).json();
  expect(sf.campaigns).toHaveLength(0);
  await act("Publicar", /Campanha publicada/);
  // editar preço depois de publicada → aviso de nova aprovação, vitrine mantém o publicado
  scope = await openItem(/Óleo de soja.*R\$/);
  await scope.getByLabel(/^Preço( \*)?$/).fill("749");
  if (mobile) await scope.getByRole("button", { name: "Fechar" }).click();
  await waitSaved(page);
  // D-02: depois de editar uma campanha publicada, a tela deveria avisar que a aprovação caiu e que a vitrine
  // continua com a versão publicada. Hoje só aparece "Rascunho" (soft: registra o defeito e continua).
  await expect(bar.getByText("Rascunho").first()).toBeVisible();
  await expect.soft(page.getByRole("note").filter({ hasText: /aprovar de novo|nova aprovação/ }), "D-02 aviso de reaprovação").toBeVisible({ timeout: 3000 });
  await shot(page, "qa-08-reaprovacao", P);
  sf = await (await page.request.get(`/api/storefront/${slug}`)).json();
  expect(sf.campaigns[0].items.find((i: any) => i.name.startsWith("Óleo")).offer.priceCents).toBe(799);
  await act("Enviar para revisão", /Enviada para revisão/);
  await act("Aprovar", /Campanha aprovada/);
  await act("Publicar", /Campanha publicada/);
  sf = await (await page.request.get(`/api/storefront/${slug}`)).json();
  expect(sf.campaigns[0].items.find((i: any) => i.name.startsWith("Óleo")).offer.priceCents).toBe(749);
  await act("Encerrar", /Campanha encerrada/);
  expect((await editorState(page, id)).campaign.status).toBe("encerrada");
  sf = await (await page.request.get(`/api/storefront/${slug}`)).json();
  expect(sf.campaigns).toHaveLength(0);

  // ---------- exportação pela interface + prévia × PNG (critério 6) ----------
  if (mobile) await page.getByRole("button", { name: "Exportar arquivos" }).click();
  else await page.getByRole("button", { name: /^Exportar/ }).first().click();
  const exp = page.getByRole("dialog", { name: "Exportar arquivos" });
  await exp.getByText(/Escolher formatos|Formatos avulsos|Escolher/).first().click().catch(() => undefined);
  await assertFits(page, "diálogo exportar");
  await shot(page, "qa-09-exportar", P);
  const r = await page.request.post(`/api/campaigns/${id}/exports`, { data: { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] } });
  const job = await r.json();
  let done: any;
  await expect.poll(async () => { done = await (await page.request.get(`/api/exports/${job.id}`)).json(); return done.status; }, { timeout: 180_000 }).toMatch(/concluida|falhou/);
  expect(done.status).toBe("concluida");
  if (!mobile) {
    await page.keyboard.press("Escape");
    await page.getByRole("tablist", { name: "Formatos" }).getByRole("tab", { name: "Post 1:1" }).click();
    const prev = page.locator('section[aria-label="Prévia"] [data-ev-page="0"]').first();
    await expect(prev).toBeVisible();
    await page.waitForTimeout(6000); // espera os avisos (toasts) sumirem de cima da prévia
    const box = await prev.boundingBox();
    const shotBuf = await prev.screenshot();
    let png: Buffer<ArrayBufferLike> = Buffer.from(await (await page.request.get(done.downloadUrl)).body());
    if (png[0] === 0x50) { const z = await JSZip.loadAsync(png); png = await z.file(Object.keys(z.files).find((k) => k.endsWith(".png"))!)!.async("nodebuffer"); }
    const W = Math.round(box!.width), H = Math.round(box!.height);
    const a = await sharp(png).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const b = await sharp(shotBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
    const mae = sum / a.length;
    console.log(`prévia do editor ${W}×${H} × PNG 1080×1080 reduzido: erro médio por canal = ${mae.toFixed(2)} (0–255)`);
    await sharp(shotBuf).toFile(`${SHOTS}/qa-10-previa-editor.png`);
    await sharp(png).resize(W, H).toFile(`${SHOTS}/qa-10-png-exportado-reduzido.png`);
    expect(mae).toBeLessThan(12);
  }
});
