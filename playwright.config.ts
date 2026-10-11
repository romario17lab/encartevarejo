import { defineConfig } from "@playwright/test";

// E2E do fluxo principal. Rode contra um servidor já iniciado:
//   E2E_BASE_URL=http://localhost:3104 npx playwright test
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["qa/**"], // e2e/qa é do agente de Qualidade
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./e2e-output/test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3104",
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
