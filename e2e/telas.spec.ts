import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Visita as demais telas, verifica que carregam sem erro e tira capturas (390 px e 1280 px).
const OUT = "e2e-output";
mkdirSync(OUT, { recursive: true });

test("demais telas carregam e os fluxos de colar lista e preços em massa funcionam", async ({ page }, info) => {
  const sfx = info.project.name.startsWith("celular") ? "390" : "1280";
  const email = `telas-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;
  const r = await page.request.post("/api/auth/signup", { data: { name: "Telas Teste", email, password: "senha-segura-123", orgName: "Mercado Telas", storeName: "Mercado Telas", segment: "hortifruti" } });
  expect(r.ok()).toBeTruthy();

  // colar lista → revisão → salvar
  await page.goto("/app/produtos/colar");
  await page.getByLabel("Lista").fill("Tomate italiano kg 6,99\nAlface crespa un 2,49\nLinha sem preço");
  await page.getByRole("button", { name: "Ler lista" }).click();
  await expect(page.getByText("Revise antes de salvar")).toBeVisible();
  await page.screenshot({ path: `${OUT}/20-colar-${sfx}.png`, fullPage: true });
  await page.getByRole("button", { name: /^Salvar \d+ produto/ }).click();
  await expect(page.getByText(/produtos? salvos?\./).first()).toBeVisible();

  // preços em massa
  await page.goto("/app/produtos/precos");
  await page.getByRole("tab", { name: /Colar/ }).click();
  await page.getByLabel(/nome;preço/).fill("Tomate italiano;5,99");
  await page.getByRole("button", { name: "Aplicar na lista" }).click();
  await page.getByRole("button", { name: "Revisar alterações" }).click();
  const dlg = page.getByRole("dialog", { name: "Confira antes de confirmar" });
  await expect(dlg.getByText("R$ 5,99")).toBeVisible();
  await page.screenshot({ path: `${OUT}/21-precos-diff-${sfx}.png`, fullPage: false });
  await dlg.getByRole("button", { name: /^Confirmar/ }).click();
  await expect(page.getByText(/preço atualizado/)).toBeVisible();

  // importação de planilha CSV
  await page.goto("/app/produtos/importar");
  await page.locator("#import-file").setInputFiles({ name: "produtos.csv", mimeType: "text/csv", buffer: Buffer.from("Produto;Preço;Unidade;Categoria\nArroz 5kg;24,90;pct;Mercearia\nFeijão 1kg;7,49;pct;Mercearia\n", "utf8") });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByLabel(/^Nome do produto/)).toHaveValue("Produto");
  await page.screenshot({ path: `${OUT}/32-importar-colunas-${sfx}.png`, fullPage: true });
  await page.getByRole("button", { name: "Conferir dados" }).click();
  await page.screenshot({ path: `${OUT}/33-importar-conferir-${sfx}.png`, fullPage: true });
  await page.getByRole("button", { name: /^Importar 2 linhas/ }).click();
  await expect(page.getByText("Importação concluída")).toBeVisible();

  for (const [path, name, heading] of [
    ["/app", "22-inicio", /Olá, Telas/],
    ["/app/campanhas", "23-campanhas", "Campanhas"],
    ["/app/produtos?issues=sem_imagem", "24-produtos-sem-foto", "Produtos"],
    ["/app/produtos/importar", "25-importar", "Importar planilha"],
    ["/app/produtos/duplicados", "26-duplicados", "Prováveis duplicados"],
    ["/app/equipe", "27-equipe", "Equipe"],
    ["/app/conta", "28-conta", "Conta"],
    ["/app/mais", "29-mais", "Mais"],
    ["/entrar", "30-entrar", "Entrar"],
    ["/esqueci-senha", "31-esqueci", "Esqueci minha senha"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("alert").filter({ hasText: /Algo deu errado|Não foi possível/ })).toHaveCount(0);
    await page.screenshot({ path: `${OUT}/${name}-${sfx}.png`, fullPage: true });
  }

  // convite
  await page.goto("/app/equipe");
  await page.getByLabel("E-mail").fill(`convidado-${Date.now()}@exemplo.com`);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/Convite enviado/)).toBeVisible();
});
