import { defineConfig } from "@playwright/test";

// Testes de aceitação de interface (Agente de Qualidade). Servidor de produção já iniciado:
//   QA_BASE_URL=http://localhost:3105 DATABASE_URL=postgres://postgres@127.0.0.1:5432/ev_qa \
//   npx playwright test -c e2e/qa/playwright.config.ts
export default defineConfig({
  testDir: ".",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../e2e-output/qa-results",
  use: {
    baseURL: process.env.QA_BASE_URL || "http://localhost:3105",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
  },
  projects: [
    { name: "celular-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
