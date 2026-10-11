// Fila de tarefas (pg-boss, dentro do Postgres). Compartilhada pela API (enfileirar) e pelo worker.
import { PgBoss } from "pg-boss";

export const EXPORT_QUEUE = "export";
export const SWEEPER_QUEUE = "export-sweeper";
export const SCHEDULER_QUEUE = "campaign-scheduler";
/** tentativas extras além da primeira */
export const EXPORT_RETRY_LIMIT = 2;

const g = globalThis as unknown as { __evBoss?: Promise<PgBoss> };

/** Instância do pg-boss. `role: "web"` só envia (sem manutenção nem agendador). */
export function getBoss(role: "web" | "worker" = "web"): Promise<PgBoss> {
  if (!g.__evBoss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não configurada");
    const boss = new PgBoss({
      connectionString,
      schema: "pgboss",
      max: role === "web" ? 2 : 5,
      application_name: `encartevarejo-${role}`,
      supervise: role === "worker",
      schedule: role === "worker",
    });
    boss.on("error", (e: unknown) => console.error("[fila] erro:", e instanceof Error ? e.message : e));
    g.__evBoss = boss.start().then(async (b) => {
      await ensureQueues(b);
      return b;
    }).catch((e) => { g.__evBoss = undefined; throw e; });
  }
  return g.__evBoss;
}

async function ensureQueues(b: PgBoss) {
  const existing = new Set((await b.getQueues()).map((q) => q.name));
  if (!existing.has(EXPORT_QUEUE))
    await b.createQueue(EXPORT_QUEUE, { retryLimit: EXPORT_RETRY_LIMIT, retryDelay: 20, retryBackoff: true, expireInSeconds: 15 * 60 });
  if (!existing.has(SWEEPER_QUEUE)) await b.createQueue(SWEEPER_QUEUE, { retryLimit: 0, expireInSeconds: 120 });
  if (!existing.has(SCHEDULER_QUEUE)) await b.createQueue(SCHEDULER_QUEUE, { retryLimit: 0, expireInSeconds: 120 });
}

export async function enqueueExport(jobId: string): Promise<void> {
  const boss = await getBoss("web");
  await boss.send(EXPORT_QUEUE, { jobId }, { singletonKey: jobId, retryLimit: EXPORT_RETRY_LIMIT, retryDelay: 20, retryBackoff: true });
}

export async function stopBoss(): Promise<void> {
  const b = g.__evBoss;
  g.__evBoss = undefined;
  if (b) await (await b).stop({ graceful: true, timeout: 20_000 }).catch(() => undefined);
}
