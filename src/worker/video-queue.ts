// Fila de vídeos (pg-boss). Separada da fila de exportação: vídeos demoram mais e usam outra concorrência.
import type { PgBoss } from "pg-boss";
import { getBoss } from "./queue";
import { VIDEO_RETRY_LIMIT } from "@/server/video/schema";

export const VIDEO_QUEUE = "video";
export const VIDEO_SWEEPER_QUEUE = "video-sweeper";

const g = globalThis as unknown as { __evVideoQueues?: WeakSet<object> };
const ready = (g.__evVideoQueues ??= new WeakSet());

export async function ensureVideoQueues(b: PgBoss): Promise<void> {
  if (ready.has(b)) return;
  const existing = new Set((await b.getQueues()).map((q) => q.name));
  // novas tentativas automáticas com espera crescente (30 s, 60 s…); um vídeo pode levar alguns minutos
  if (!existing.has(VIDEO_QUEUE)) await b.createQueue(VIDEO_QUEUE, { retryLimit: VIDEO_RETRY_LIMIT, retryDelay: 30, retryBackoff: true, expireInSeconds: 30 * 60 });
  if (!existing.has(VIDEO_SWEEPER_QUEUE)) await b.createQueue(VIDEO_SWEEPER_QUEUE, { retryLimit: 0, expireInSeconds: 120 });
  ready.add(b);
}

export async function enqueueVideo(jobId: string, role: "web" | "worker" = "web"): Promise<void> {
  const boss = await getBoss(role);
  await ensureVideoQueues(boss);
  await boss.send(VIDEO_QUEUE, { jobId }, { singletonKey: jobId, retryLimit: VIDEO_RETRY_LIMIT, retryDelay: 30, retryBackoff: true });
}
