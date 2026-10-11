// Critério 8 — o fluxo funciona em ~390 px: sem rolagem horizontal, controles alcançáveis. Captura cada tela.
import { expect, test } from "@playwright/test";
import { apiProduct, apiSignup, assertFits, shot } from "./util";

test("telas principais sem rolagem horizontal", async ({ page }, info) => {
  const P = info.project.name;
  for (const [path, name] of [["/", "qa-30-inicio"], ["/cadastro", "qa-31-cadastro"], ["/entrar", "qa-32-entrar"], ["/esqueci-senha", "qa-33-esqueci"]] as const) {
    await page.goto(path); await page.waitForLoadState("networkidle");
    await assertFits(page, path); await shot(page, name, P);
  }
  const { me } = await apiSignup(page.request, P.startsWith("celular") ? "telas390" : "telasdesk");
  const ids: string[] = [];
  for (const [n, c] of [["Arroz tipo 1 5kg", 2490], ["Feijão carioca 1kg", 749], ["Biscoito recheado sabor chocolate com avelã pacote família econômico", 389]] as const)
    ids.push((await apiProduct(page.request, { name: n, unit: "pct", regularCents: c })).id);
  const st = await (await page.request.post("/api/campaigns", { data: { storeId: me.stores[0].id, name: "Campanha telas", templateId: "hortifruti-fresco", productIds: ids, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 4 * 864e5).toISOString() } })).json();
  const screens = [
    ["/app", "qa-40-painel"], ["/app/campanhas", "qa-41-campanhas"], ["/app/campanhas/nova", "qa-42-nova"],
    [`/app/campanhas/${st.campaign.id}`, "qa-43-editor"], ["/app/produtos", "qa-44-produtos"], ["/app/produtos/importar", "qa-45-importar"],
    ["/app/produtos/colar", "qa-46-colar"], ["/app/produtos/precos", "qa-47-precos"], ["/app/produtos/duplicados", "qa-48-duplicados"],
    ["/app/loja", "qa-49-loja"], ["/app/equipe", "qa-50-equipe"], ["/app/conta", "qa-51-conta"], ["/app/mais", "qa-52-mais"],
  ] as const;
  const problems: string[] = [];
  for (const [path, name] of screens) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await expect(page.getByRole("alert").filter({ hasText: /Algo deu errado|Não foi possível|Erro inesperado/ })).toHaveCount(0);
    try { await assertFits(page, path); } catch (e) { problems.push(`${path}: ${(e as Error).message.split("\n")[0]}`); }
    await shot(page, name, P);
  }
  // editor no celular: todas as abas e o botão de exportar ficam alcançáveis
  if (P.startsWith("celular")) {
    await page.goto(`/app/campanhas/${st.campaign.id}`);
    for (const tab of ["Produtos (3)", "Prévia", "Peça", "Campanha", "Avisos"]) {
      const t = page.getByRole("tab", { name: new RegExp(`^${tab.replace(/[()]/g, "\\$&")}`) });
      await t.scrollIntoViewIfNeeded();
      await t.click();
      await expect(t).toHaveAttribute("aria-selected", "true");
      try { await assertFits(page, `editor/${tab}`); } catch (e) { problems.push(`editor/${tab}: ${(e as Error).message.split("\n")[0]}`); }
      await shot(page, `qa-53-editor-aba-${tab.split(" ")[0]!.toLowerCase()}`, P);
    }
    await expect(page.getByRole("button", { name: "Exportar arquivos" })).toBeInViewport();
  }
  console.log(problems.join("\n") || "sem problemas");
  expect(problems).toEqual([]);
});
