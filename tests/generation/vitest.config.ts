// Configuração local dos testes do Agente de Geração (usada quando a raiz não tem vitest.config.ts).
// Uso: npx vitest run --config tests/generation/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    include: ["tests/generation/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 240_000,
    hookTimeout: 300_000,
    pool: "forks",
    fileParallelism: false,
  },
});
