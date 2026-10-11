// Testes de aceitação do Agente de Qualidade (caixa-preta via HTTP contra um servidor de produção
// em execução + worker real). NÃO usa o global-setup que recria o banco.
//   QA_BASE_URL=http://localhost:3105 DATABASE_URL=postgres://postgres@127.0.0.1:5432/ev_qa \
//   APP_SECRET=<o mesmo do servidor> npx vitest run -c tests/qa/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  root,
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    include: ["tests/qa/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    pool: "forks",
    testTimeout: 600_000,
    hookTimeout: 600_000,
    env: { DB_POOL_MAX: "3" },
  },
});
