// Registro do processamento de vídeos no worker (chamado por src/worker/index.ts).
import type { PgBoss } from "pg-boss";
import { runVideoJob, sweepStuckVideos, VIDEO_RETRY_LIMIT } from "@/server/video/run";
import { ensureVideoQueues, enqueueVideo, VIDEO_QUEUE, VIDEO_SWEEPER_QUEUE } from "./video-queue";

export async function registerVideoWorker(boss: PgBoss): Promise<void> {
  await ensureVideoQueues(boss);
  const requeue = (id: string) => enqueueVideo(id, "worker");
  // recuperação ao iniciar: pedidos que ficaram "processando" quando o worker caiu
  await sweepStuckVideos(requeue).catch((e) => console.error("[video] recuperação inicial falhou:", (e as Error).message));
  const concurrency = Math.max(1, Number(process.env.VIDEO_CONCURRENCY ?? 1));
  await boss.work<{ jobId: string }>(VIDEO_QUEUE, { batchSize: 1, localConcurrency: concurrency }, async ([job]) => {
    await runVideoJob(job.data.jobId, { finalAttempt: job.retryCount >= VIDEO_RETRY_LIMIT }); // lança quando ainda há tentativas
  });
  await boss.work(VIDEO_SWEEPER_QUEUE, async () => { await sweepStuckVideos(requeue); });
  await boss.schedule(VIDEO_SWEEPER_QUEUE, "* * * * *");
  console.info(`[worker] fila "${VIDEO_QUEUE}" pronta (concorrência ${concurrency}), recuperação a cada minuto.`);
}
