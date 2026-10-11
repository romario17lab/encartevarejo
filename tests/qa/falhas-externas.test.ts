// Critério 13 — falhas de serviços externos tratadas com clareza.
//  a) Chromium inexistente no worker → job "falhou" com mensagem em português (após as tentativas da fila);
//  b) banco fora do ar → API responde 500 JSON amigável (servidor extra apontando para porta fechada);
//  c) sem SMTP → e-mail de recuperação fica na caixa de saída (email_outbox).
// (a) PARA o worker principal (QA_WORKER_PIDFILE) e o reinicia ao final.
import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { campaign, product, signup, sql, waitExport, Api } from "./helpers";

const ROOT = new URL("../..", import.meta.url).pathname;
const PIDFILE = process.env.QA_WORKER_PIDFILE;
const LOGDIR = process.env.QA_LOG_DIR ?? "/tmp";
const children: ChildProcess[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
afterAll(() => { for (const c of children) try { process.kill(-c.pid!, "SIGTERM"); } catch { /* já saiu */ } });

function startWorker(env: Record<string, string>, log: string) {
  const out = openSync(`${LOGDIR}/${log}`, "a");
  const c = spawn("npx", ["tsx", "src/worker/index.ts"], { cwd: ROOT, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", out, out] });
  return c;
}

describe("falhas externas", () => {
  it("a) Chromium ausente no worker → exportação 'falhou' com mensagem clara em português", async () => {
    if (PIDFILE && existsSync(PIDFILE)) {
      const pid = Number(readFileSync(PIDFILE, "utf8"));
      for (const target of [-pid, pid]) try { process.kill(target, "SIGTERM"); } catch { /* */ }
      await sleep(3000);
    }
    const bad = startWorker({ CHROMIUM_PATH: "/caminho/inexistente/chrome" }, "worker-sem-chromium.log");
    children.push(bad);
    await sleep(5000);
    const A = await signup("Falha");
    const p = await product(A, { name: "Sabão em pó 1kg", unit: "pct", regularCents: 1290 });
    const c = (await campaign(A, [p.id])).campaign;
    const r = await A.api.post(`/api/campaigns/${c.id}/exports`, { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] });
    expect(r.status).toBe(201);
    const { job, seen } = await waitExport(A, r.json.id, 300_000);
    console.log("estados:", seen.join(" → "), "| tentativas:", job.attempts, "| erro:", job.error);
    expect(job.status).toBe("falhou");
    expect(job.error).toMatch(/Não foi possível gerar os arquivos|Tente novamente/);
    expect(job.error).not.toMatch(/chrome|Executable|ENOENT|stack/i);
    expect(job.attempts).toBe(3);
    try { process.kill(-bad.pid!, "SIGTERM"); } catch { /* */ }
    await sleep(2000);
    // reinicia o worker normal e confere que uma nova exportação funciona
    const good = startWorker({}, "worker.log");
    if (PIDFILE) writeFileSync(PIDFILE, String(good.pid));
    good.unref();
    const r2 = await A.api.post(`/api/campaigns/${c.id}/exports`, { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] });
    expect((await waitExport(A, r2.json.id, 120_000)).job.status).toBe("concluida");
  });

  it("b) banco fora do ar → 500 JSON amigável, sem detalhes técnicos", async () => {
    const port = 3197;
    const out = openSync(`${LOGDIR}/web-sem-banco.log`, "a");
    const web = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, env: { ...process.env, DATABASE_URL: "postgres://postgres@127.0.0.1:5999/nada" }, detached: true, stdio: ["ignore", out, out] });
    children.push(web);
    for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port}/`); break; } catch { await sleep(1000); } }
    const api = new Api();
    const base = `http://localhost:${port}`;
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.1.2.3" }, body: JSON.stringify({ email: "x@exemplo.com", password: "senha-qualquer-123" }) });
    const lj = await login.json();
    console.log("login sem banco:", login.status, JSON.stringify(lj));
    expect(login.status).toBe(500);
    expect(lj.error.message).toMatch(/Erro inesperado|Tente novamente/);
    expect(JSON.stringify(lj)).not.toMatch(/ECONNREFUSED|5999|postgres/i);
    const sf = await fetch(`${base}/api/storefront/qualquer-loja`);
    const sj = await sf.json();
    expect(sf.status).toBe(500);
    expect(JSON.stringify(sj)).not.toMatch(/ECONNREFUSED|postgres/i);
    const page = await fetch(`${base}/entrar`);
    console.log("página /entrar sem banco:", page.status);
    void api;
    process.kill(-web.pid!, "SIGTERM");
  });

  it("c) sem SMTP → recuperação de senha vai para a caixa de saída; resposta igual para e-mail inexistente", async () => {
    const A = await signup("Smtp");
    const r1 = await A.api.post("/api/auth/forgot", { email: A.email });
    const r2 = await A.api.post("/api/auth/forgot", { email: "ninguem-aqui@exemplo.com" });
    expect(r1.status).toBe(r2.status);
    expect(r1.json).toEqual(r2.json);
    const rows = await sql("select kind, subject, text_body from email_outbox where to_email=$1 order by created_at desc", [A.email]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].text_body).toMatch(/redefinir-senha\?token=/);
  });
});
