// Executa UM pedido de vídeo e termina (modo VIDEO_INLINE=1 de desenvolvimento: o processo web dispara
// este script em segundo plano, sem precisar do worker). Uso: tsx src/worker/video-run-once.ts <jobId>
import { getPool } from "@/server/db";
import { closeBrowser } from "@/server/export/browser";
import { runVideoJob } from "@/server/video/run";

const jobId = process.argv[2];
if (!jobId) { console.error("uso: video-run-once <jobId>"); process.exit(2); }
runVideoJob(jobId, { finalAttempt: true })
  .then((r) => console.info(`[video] ${jobId}: ${r}`))
  .catch((e) => { console.error(`[video] ${jobId} falhou:`, (e as Error).message); process.exitCode = 1; })
  .finally(async () => { await closeBrowser(); await getPool().end().catch(() => undefined); });
