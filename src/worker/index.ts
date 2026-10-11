// Worker (npm run worker): exportações, varredura de jobs travados e agendador de campanhas.
import { and, eq, lt } from "drizzle-orm";
import { getDb, getPool, schema } from "@/server/db";
import { runExportJob } from "@/server/export/run";
import { closeBrowser } from "@/server/export/browser";
import { EXPORT_QUEUE, EXPORT_RETRY_LIMIT, SCHEDULER_QUEUE, SWEEPER_QUEUE, getBoss, stopBoss } from "./queue";

const STUCK_MINUTES = 10;
const MAX_ATTEMPTS = EXPORT_RETRY_LIMIT + 1;

/** Jobs em 'processando' há mais de 10 min (worker caiu no meio): reenfileira ou marca como falhou. */
export async function sweepStuckExports(now = new Date()): Promise<{ requeued: string[]; failed: string[] }> {
  const db = getDb();
  const limit = new Date(now.getTime() - STUCK_MINUTES * 60_000);
  const stuck = await db.select().from(schema.exportJobs)
    .where(and(eq(schema.exportJobs.status, "processando"), lt(schema.exportJobs.startedAt, limit)));
  const requeued: string[] = [], failed: string[] = [];
  for (const job of stuck) {
    if (job.attempts < MAX_ATTEMPTS) {
      await db.update(schema.exportJobs).set({ status: "na_fila", error: "Tentando novamente…" })
        .where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.status, "processando")));
      const boss = await getBoss("worker");
      await boss.send(EXPORT_QUEUE, { jobId: job.id }, { retryLimit: 0 });
      requeued.push(job.id);
    } else {
      await db.update(schema.exportJobs).set({ status: "falhou", error: "A exportação demorou demais e foi interrompida. Tente novamente.", finishedAt: now })
        .where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.status, "processando")));
      failed.push(job.id);
    }
  }
  if (requeued.length || failed.length) console.warn(`[varredura] reenfileirados: ${requeued.length}, falharam: ${failed.length}`);
  return { requeued, failed };
}

/** Agendador de campanhas (publicação agendada/encerramento), escrito pelo Agente de Backend. */
async function runScheduler(): Promise<void> {
  const modPath = "@/server/services/scheduler";
  let mod: { runCampaignScheduler?: () => Promise<unknown> };
  try {
    mod = await import(/* @vite-ignore */ modPath);
  } catch (e) {
    console.warn("[agendador] src/server/services/scheduler.ts indisponível:", (e as Error).message);
    return;
  }
  if (typeof mod.runCampaignScheduler !== "function") { console.warn("[agendador] runCampaignScheduler não exportado"); return; }
  await mod.runCampaignScheduler(); // o próprio agendador registra a execução em job_runs
}

async function main() {
  const boss = await getBoss("worker");
  const concurrency = Math.max(1, Number(process.env.EXPORT_CONCURRENCY ?? 2));

  await boss.work<{ jobId: string }>(EXPORT_QUEUE, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => {
    const finalAttempt = job.retryCount >= EXPORT_RETRY_LIMIT;
    await runExportJob(job.data.jobId, { finalAttempt }); // lança quando ainda há tentativas → a fila tenta de novo
  });

  await boss.work(SWEEPER_QUEUE, async () => { await sweepStuckExports(); });
  await boss.schedule(SWEEPER_QUEUE, "* * * * *");

  await boss.work(SCHEDULER_QUEUE, async () => { await runScheduler(); });
  await boss.schedule(SCHEDULER_QUEUE, "* * * * *");
  await (await import("./video-worker")).registerVideoWorker(boss); // vídeos de ofertas (fila "video" + recuperação)

  console.info(`[worker] pronto: fila "${EXPORT_QUEUE}" (concorrência ${concurrency}), varredura e agendador a cada minuto.`);

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal}: encerrando…`);
    await stopBoss();
    await closeBrowser();
    await getPool().end().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

const isMain = process.argv[1] && /src[\\/]worker[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => { console.error("[worker] falha ao iniciar:", e); process.exit(1); });
}
