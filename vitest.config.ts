// Configuração de testes (Agente de Backend). Testes de servidor usam Postgres REAL:
// banco TEST_DATABASE_URL (padrão: ev_be_test), recriado do zero a cada execução (tests/server/global-setup.ts).
import { defineConfig } from "vitest/config";
import path from "node:path";
import { tmpdir } from "node:os";

const root = import.meta.dirname;
const testDb = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/ev_be_test";

export default defineConfig({
  root,
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next*/**"],
    environment: "node",
    globalSetup: ["tests/server/global-setup.ts"],
    // testes de banco rodam em sequência (um arquivo por vez)
    fileParallelism: false,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: testDb,
      TEST_DATABASE_URL: testDb,
      APP_SECRET: process.env.APP_SECRET ?? "segredo-de-teste-com-mais-de-16-caracteres",
      APP_URL: "http://localhost:3101",
      STORAGE_DIR: process.env.TEST_STORAGE_DIR ?? path.join(tmpdir(), "ev-be-test-storage"),
      DB_POOL_MAX: "5",
    },
  },
});
