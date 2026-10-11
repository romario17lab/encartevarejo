import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Fluxo principal: cadastro → loja → 3 produtos → campanha no modo rápido → editar preço no editor
// → salvamento automático → recarregar mantém → exportar.
const OUT = "e2e-output";
mkdirSync(OUT, { recursive: true });

const shot = async (page: Page, name: string, project: string) => {
  if (project.startsWith("celular")) await page.screenshot({ path: `${OUT}/${name}-390.png`, fullPage: true });
  else await page.screenshot({ path: `${OUT}/${name}-1280.png`, fullPage: false });
};

const PRODUCTS = [
  { name: "Arroz branco tipo 1 5kg", unit: "pct", price: "2490" },
  { name: "Feijão carioca 1kg", unit: "pct", price: "749" },
  { name: "Banana prata", unit: "kg", price: "499" },
];

test("fluxo principal do lojista", async ({ page }, info) => {
  const project = info.project.name;
  const mobile = project.startsWith("celular");
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@exemplo.com`;

  // 1. cadastro
  await page.goto("/");
  await shot(page, "01-inicio", project);
  await page.getByRole("link", { name: "Criar conta grátis" }).click();
  await page.getByLabel("Seu nome").fill("Lojista Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel(/^Senha/).fill("senha-segura-123");
  await page.getByLabel("Nome da loja").fill("Mercado Teste E2E");
  await shot(page, "02-cadastro", project);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // 2. dados da loja
  await expect(page).toHaveURL(/\/app\/loja/);
  await expect(page.getByText("Conta criada!")).toBeVisible();
  await page.getByLabel("Telefone").fill("(11) 3333-4444");
  await page.getByLabel("WhatsApp").fill("(11) 99999-0000");
  await page.getByLabel("Rua / avenida").fill("Rua das Flores");
  await page.getByLabel("Número").fill("100");
  await page.getByLabel("Cidade").fill("São Paulo");
  await page.getByRole("button", { name: "Salvar dados da loja" }).click();
  await expect(page.getByText("Dados da loja salvos.")).toBeVisible();
  await shot(page, "03-loja", project);
  await page.getByRole("tab", { name: "Identidade visual" }).click();
  await expect(page.getByRole("heading", { name: "Cores" })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, "04-identidade", project);

  // 3. três produtos
  await page.goto("/app/produtos");
  await expect(page.getByText("Nenhum produto cadastrado")).toBeVisible();
  for (const p of PRODUCTS) {
    await page.getByRole("button", { name: "Novo produto" }).click();
    const dlg = page.getByRole("dialog", { name: "Novo produto" });
    await dlg.getByLabel("Nome do produto").fill(p.name);
    await dlg.getByLabel("Unidade de venda").selectOption(p.unit);
    await dlg.getByLabel("Preço normal").fill(p.price);
    if (p === PRODUCTS[0]) await shot(page, "05-produto-form", project);
    await dlg.getByRole("button", { name: "Cadastrar produto" }).click();
    await expect(dlg).toBeHidden();
  }
  await expect(page.getByText("3 produtos")).toBeVisible();
  await shot(page, "06-produtos", project);

  // 4. campanha no modo rápido
  await page.goto("/app");
  await page.getByRole("link", { name: /Criar campanha/ }).first().click();
  await expect(page).toHaveURL(/\/app\/campanhas\/nova/);
  await page.waitForLoadState("networkidle");
  const firstTemplate = page.getByRole("radiogroup", { name: "Modelos" }).getByRole("radio").first();
  await firstTemplate.click();
  await page.waitForTimeout(1500);
  await shot(page, "07-modelos", project);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Selecionar os 3 visíveis/ }).click();
  await expect(page.getByText("3 produtos selecionados")).toBeVisible();
  await shot(page, "08-produtos-campanha", project);
  await page.getByRole("button", { name: "Revisar ofertas" }).click();
  await expect(page.getByText("Tudo certo")).toBeVisible();
  await shot(page, "09-revisao", project);
  await page.getByRole("button", { name: "Gerar campanha" }).click();
  await expect(page).toHaveURL(/\/app\/campanhas\/cmp_[a-z0-9]+/, { timeout: 120_000 });
  const editorUrl = page.url().split("?")[0];
  await expect(page.locator("[data-ev-render]").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, "10-editor-previa", project);

  // 5. editar preço do feijão no editor
  if (mobile) await page.getByRole("tab", { name: /Produtos \(3\)/ }).click();
  await page.getByRole("button", { name: /Feijão carioca 1kg.*R\$/ }).click();
  const scope = mobile ? page.getByRole("dialog") : page.getByRole("complementary", { name: "Propriedades" });
  const price = scope.getByLabel(/^Preço( \*)?$/);
  await price.fill("699");
  await expect(price).toHaveValue("6,99");
  await shot(page, "11-editor-item", project);
  if (mobile) await scope.getByRole("button", { name: "Fechar" }).click();

  // 6. salvamento automático
  await expect(page.getByText(/Salvo às \d\d:\d\d/)).toBeVisible({ timeout: 30_000 });

  // 7. recarregar mantém
  await page.goto(editorUrl);
  if (mobile) await page.getByRole("tab", { name: /Produtos \(3\)/ }).click();
  await expect(page.getByRole("button", { name: /Feijão carioca 1kg.*R\$/ })).toContainText("R$ 6,99");
  await shot(page, "12-editor-recarregado", project);

  // avisos (diagnóstico no log)
  if (!mobile) {
    await page.getByRole("tab", { name: /^Avisos/ }).click();
    console.log("AVISOS:", (await page.getByRole("complementary", { name: "Propriedades" }).innerText()).slice(0, 3000));
  }

  // 8. exportação (pacote completo)
  await page.getByRole("button", { name: /^Exportar/ }).first().click();
  const exp = page.getByRole("dialog", { name: "Exportar arquivos" });
  await shot(page, "13-exportar", project);
  await exp.getByRole("button", { name: "Gerar arquivos" }).click();
  await expect(exp.getByRole("link", { name: /^Baixar/ }).or(exp.getByText("A exportação falhou"))).toBeVisible({ timeout: 200_000 });
  await shot(page, "14-exportacao-resultado", project);
  await expect(exp.getByRole("link", { name: /^Baixar/ })).toBeVisible();
});
