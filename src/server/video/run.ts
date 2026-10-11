// Execução de um pedido de vídeo (worker pg-boss ou, em desenvolvimento, dentro do processo web):
// na_fila → processando (com progresso e sinal de vida) → concluida | falhou. Arquivos temporários
// são sempre apagados. Recuperação de pedidos travados após queda do worker: sweepStuckVideos().
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { newId } from "@/server/ids";
import { sha256 } from "@/server/signing";
import { storage } from "@/server/storage";
import { slugify } from "@/server/text";
import { readAsset } from "@/server/services/assets";
import { recordUsage } from "@/server/services/plans";
import { effectiveOverrides, loadRenderBundle, type RenderBundle } from "@/server/services/render-data";
import { getTemplate } from "@/templates/registry";
import { offersFingerprint } from "@/render/fingerprint";
import { ORIENTATIONS } from "@/render/video/options";
import type { VideoPlan } from "@/render/video/plan";
import { planForBundle } from "./plan-bundle";
import { defaultNarration } from "@/render/video/narration";
import { mixAudio, synthSoundtrack, type NarrationClip } from "./audio";
import { probe } from "./ffmpeg";
import { renderVideoFrames, muxAudio, verifyMp4, VideoCancelled, VideoFailure, type AssetResolver } from "./render";
import { readJobOptions, VIDEO_RETRY_LIMIT, type VideoResultInfo } from "./schema";
export { VIDEO_RETRY_LIMIT };
import { discardAsset } from "./files";
import { getTtsProvider, TtsError } from "./tts";

type JobRow = typeof schema.videoJobs.$inferSelect;

export const VIDEO_MAX_ATTEMPTS = VIDEO_RETRY_LIMIT + 1;
/** sem sinal de vida por este tempo = worker caiu no meio */
export const VIDEO_STUCK_MS = 3 * 60_000;
export const VIDEO_GENERIC_FAILURE = "Não foi possível gerar o vídeo. Tente novamente em alguns minutos.";


const assetResolver = (orgId: string): AssetResolver => async (assetId, token) => {
  const { asset, data } = await readAsset(assetId, { token });
  if (asset.orgId !== orgId) return null;
  return { data, mime: asset.mime };
};

export interface VideoOutcome { assetId: string; bytes: number; result: VideoResultInfo }

/** Gera o MP4 de um pedido registrado em video_jobs. */
export async function generateVideo(job: JobRow, onProgress: (f: number) => Promise<boolean>): Promise<VideoOutcome> {
  const opts = readJobOptions(job.options);
  let bundle: RenderBundle;
  try {
    bundle = await loadRenderBundle({ orgId: job.orgId }, job.campaignId, { version: job.campaignVersion, signedUrlTtlSec: 3 * 3600 });
  } catch (e) {
    throw new VideoFailure((e as Error).message || "Campanha não encontrada.", false, `bundle: ${(e as Error).message}`);
  }
  const errors = bundle.issues.filter((i) => i.level === "error");
  if (errors.length) throw new VideoFailure(`Corrija as ofertas antes de gerar o vídeo: ${errors.slice(0, 4).map((e) => `“${e.name}” — ${e.message}`).join("; ")}.`, false, "offer errors");
  const template = getTemplate(bundle.templateId, bundle.templateVersion);
  if (!template) throw new VideoFailure(`O modelo ${bundle.templateId} (versão ${bundle.templateVersion}) não está disponível.`, false, "template missing");

  const orientation = job.orientation;
  const plan = planForBundle(bundle, { orientation, style: opts.style, duration: opts.duration, fps: opts.fps });
  if (!plan.shownItemIds.length) throw new VideoFailure("A campanha não tem produtos para mostrar no vídeo.", false);
  const format = ORIENTATIONS[orientation].format;
  const overrides = effectiveOverrides(bundle, format);
  const dir = await mkdtemp(path.join(tmpdir(), `ev-video-${job.id}-`));
  const warnings = [...plan.warnings];
  try {
    const silent = path.join(dir, "video.mp4");
    // 0–85%: quadros; 85–100%: áudio, junção e verificação
    const r = await renderVideoFrames({
      scene: { campaign: bundle.campaign, template, overrides, plan },
      outFile: silent, scale: opts.scale ?? 1, resolveAsset: assetResolver(job.orgId),
      expect: { version: String(bundle.version), offers: offersFingerprint(bundle.campaign.items) },
      onProgress: (f) => onProgress(f * 0.85),
    });
    if (r.imageErrors) warnings.push(`${r.imageErrors} imagem(ns) de produto não carregaram e ficaram sem foto.`);

    const audioFile = await buildAudio({ job, bundle, plan, dir, opts, warnings });
    if (!(await onProgress(0.93))) throw new VideoCancelled();
    const final = audioFile ? path.join(dir, "final.mp4") : silent;
    if (audioFile) await muxAudio(silent, audioFile, final);
    const info = await verifyMp4(final, { width: r.width, height: r.height, durationSec: plan.durationSec, audio: !!audioFile });

    const data = await readFile(final);
    const fileName = `${slugify(bundle.name || bundle.campaign.title) || "campanha"}_video-${orientation}_${plan.durationSec}s.mp4`;
    const storageKey = `${job.orgId}/videos/${job.id}.mp4`;
    await storage.put(storageKey, data, "video/mp4");
    const assetId = newId("ast");
    await getDb().insert(schema.assets).values({
      id: assetId, orgId: job.orgId, kind: "video", storageKey, mime: "video/mp4", bytes: data.length, width: r.width, height: r.height, sha256: sha256(data),
      source: "gerado_sistema", sourceNote: `Vídeo ${job.id} · campanha versão ${bundle.version}`, originalName: fileName, createdBy: job.createdBy,
    });
    return {
      assetId, bytes: data.length,
      result: {
        width: info.video!.width, height: info.video!.height, fps: r.fps, durationSec: Math.round(info.durationSec * 100) / 100, codec: info.video!.codec,
        bytes: data.length, audio: !!info.audio, shownItems: plan.shownItemIds.length, omitted: plan.omitted, warnings,
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Monta a faixa de áudio (trilha do sistema, áudio próprio e/ou narração). null = vídeo sem áudio. */
async function buildAudio(p: { job: JobRow; bundle: RenderBundle; plan: VideoPlan; dir: string; opts: ReturnType<typeof readJobOptions>; warnings: string[] }): Promise<string | null> {
  const { job, plan, dir, opts } = p;
  const D = plan.durationSec;
  let music: { file: string; loop: boolean } | null = null;
  if (opts.audio.kind === "system") {
    const f = path.join(dir, "trilha.wav");
    await synthSoundtrack(f, D);
    music = { file: f, loop: false };
  } else if (opts.audio.kind === "upload") {
    if (!opts.audio.assetId || !opts.audio.licenseConfirmed) throw new VideoFailure("O áudio próprio precisa da confirmação de licença de uso.", false);
    const [a] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, opts.audio.assetId), eq(schema.assets.orgId, job.orgId)));
    if (!a) throw new VideoFailure("O arquivo de áudio enviado não foi encontrado. Envie o áudio novamente.", false);
    const f = path.join(dir, `audio-proprio${path.extname(a.originalName ?? "") || ".bin"}`);
    await writeFile(f, await storage.get(a.storageKey));
    music = { file: f, loop: true };
  }
  const clips: NarrationClip[] = [];
  if (opts.narration.provider !== "none") {
    const provider = getTtsProvider(opts.narration.provider);
    if (!provider.configured()) throw new VideoFailure("A narração foi pedida, mas o serviço de narração não está configurado. Gere o vídeo sem narração.", false);
    const defaults = new Map(defaultNarration(p.bundle.campaign, plan).map((s) => [s.key, s.text]));
    const custom = new Map((opts.narration.segments ?? []).map((s) => [s.key, s.text]));
    for (const s of plan.scenes) {
      const text = (custom.has(s.key) ? custom.get(s.key)! : defaults.get(s.key) ?? "").trim();
      if (!text) continue;
      let mp3: Buffer;
      try { mp3 = await provider.synthesize(text, { voice: opts.narration.voice }); } catch (e) {
        if (e instanceof TtsError) throw new VideoFailure(e.userMessage, e.retryable, e.message);
        throw e;
      }
      const f = path.join(dir, `narracao-${s.key}.mp3`);
      await writeFile(f, mp3);
      const len = (await probe(f)).durationSec;
      const at = s.start + (s.kind === "intro" ? 0.3 : 0.25);
      const room = Math.max(0.5, s.end - at - 0.1);
      const tempo = len > room ? Math.min(1.35, len / room) : 1;
      if (len / tempo > room + 0.05) p.warnings.push(`A narração da cena ${s.kind === "intro" ? "de abertura" : s.kind === "outro" ? "de encerramento" : s.key.replace("s", "")} ficou longa demais para o tempo da cena e foi cortada. Encurte o texto ou aumente a duração.`);
      clips.push({ file: f, at, maxDur: room, tempo });
    }
  }
  if (!music && !clips.length) return null;
  const out = path.join(dir, "audio.m4a");
  try {
    await mixAudio({ out, durationSec: D, music, narration: clips });
  } catch (e) {
    const upload = opts.audio.kind === "upload";
    throw new VideoFailure(upload ? "Não foi possível usar o áudio enviado. Envie um MP3, M4A, WAV ou OGG válido." : "Não foi possível montar o áudio do vídeo. Tente novamente.", !upload, `audio: ${(e as Error).message}`);
  }
  await stat(out);
  return out;
}

// ------------------------------------------------------------------ status em video_jobs

const merge = (v: Record<string, unknown>) => sql`${schema.videoJobs.options} || ${JSON.stringify(v)}::jsonb`;

/**
 * Executa um pedido registrado: na_fila → processando → concluida | falhou.
 * `finalAttempt` = sem novas tentativas automáticas. Lança o erro quando ainda houver tentativas (a fila tenta de novo).
 */
export async function runVideoJob(jobId: string, opts: { finalAttempt?: boolean } = {}): Promise<"concluida" | "falhou" | "ignorada" | "cancelada"> {
  const db = getDb();
  // reivindica o pedido (só quem muda na_fila → processando executa; evita execução dupla)
  const [job] = await db.update(schema.videoJobs)
    .set({ status: "processando", attempts: sql`${schema.videoJobs.attempts} + 1`, startedAt: new Date(), finishedAt: null, error: null, progress: 0, options: merge({ heartbeatAt: new Date().toISOString() }) })
    .where(and(eq(schema.videoJobs.id, jobId), eq(schema.videoJobs.status, "na_fila")))
    .returning();
  if (!job) return "ignorada";
  const final = opts.finalAttempt || job.attempts >= VIDEO_MAX_ATTEMPTS;
  const started = Date.now();
  let last = 0;
  const onProgress = async (f: number): Promise<boolean> => {
    const now = Date.now();
    if (now - last < 1500 && f < 0.999) return true;
    last = now;
    const rows = await db.update(schema.videoJobs)
      .set({ progress: Math.min(99, Math.round(f * 100)), options: merge({ heartbeatAt: new Date(now).toISOString() }) })
      .where(and(eq(schema.videoJobs.id, job.id), eq(schema.videoJobs.status, "processando")))
      .returning({ id: schema.videoJobs.id });
    return rows.length > 0; // cancelado ou reassumido: para
  };
  try {
    const out = await generateVideo(job, onProgress);
    const done = await db.update(schema.videoJobs)
      .set({ status: "concluida", progress: 100, outputAssetId: out.assetId, finishedAt: new Date(), error: null, durationSec: Math.round(out.result.durationSec), options: merge({ result: out.result }) })
      .where(and(eq(schema.videoJobs.id, job.id), eq(schema.videoJobs.status, "processando")))
      .returning({ id: schema.videoJobs.id });
    if (!done.length) {
      await discardAsset(job.orgId, out.assetId);
      return "cancelada";
    }
    await recordUsage(job.orgId, "video_second", Math.max(1, Math.round(out.result.durationSec)), job.id);
    console.info(`[video] ${job.id} concluído em ${Date.now() - started} ms (${out.result.width}x${out.result.height}, ${out.result.durationSec}s, ${out.bytes} bytes)`);
    return "concluida";
  } catch (e) {
    if (e instanceof VideoCancelled) { console.info(`[video] ${job.id} cancelado durante a geração`); return "cancelada"; }
    const failure = e instanceof VideoFailure ? e : new VideoFailure(VIDEO_GENERIC_FAILURE, true, (e as Error)?.stack ?? String(e));
    console.error(`[video] ${job.id} tentativa ${job.attempts} falhou: ${failure.message}`);
    const willRetry = failure.retryable && !final;
    await db.update(schema.videoJobs).set(willRetry
      ? { status: "na_fila", error: "Tentando novamente…", progress: 0 }
      : { status: "falhou", error: failure.userMessage, finishedAt: new Date() },
    ).where(and(eq(schema.videoJobs.id, job.id), eq(schema.videoJobs.status, "processando")));
    if (willRetry) throw failure;
    return "falhou";
  }
}

/**
 * Recuperação: pedidos em 'processando' sem sinal de vida há VIDEO_STUCK_MS (worker caiu no meio)
 * voltam para a fila (até VIDEO_MAX_ATTEMPTS tentativas) ou falham com mensagem clara.
 * Rodar ao iniciar o worker e a cada minuto.
 */
export async function sweepStuckVideos(enqueue: (jobId: string) => Promise<void>, now = new Date()): Promise<{ requeued: string[]; failed: string[] }> {
  const db = getDb();
  const limit = new Date(now.getTime() - VIDEO_STUCK_MS).toISOString();
  const stuck = await db.select().from(schema.videoJobs).where(and(
    eq(schema.videoJobs.status, "processando"),
    sql`coalesce((${schema.videoJobs.options}->>'heartbeatAt')::timestamptz, ${schema.videoJobs.startedAt}, ${schema.videoJobs.createdAt}) < ${limit}::timestamptz`,
  ));
  const requeued: string[] = [], failed: string[] = [];
  for (const job of stuck) {
    if (job.attempts < VIDEO_MAX_ATTEMPTS) {
      const rows = await db.update(schema.videoJobs).set({ status: "na_fila", progress: 0, error: "O processamento foi interrompido; tentando novamente…" })
        .where(and(eq(schema.videoJobs.id, job.id), eq(schema.videoJobs.status, "processando"))).returning({ id: schema.videoJobs.id });
      if (rows.length) { await enqueue(job.id); requeued.push(job.id); }
    } else {
      const rows = await db.update(schema.videoJobs).set({ status: "falhou", error: "O processamento do vídeo foi interrompido várias vezes. Tente novamente mais tarde.", finishedAt: now })
        .where(and(eq(schema.videoJobs.id, job.id), eq(schema.videoJobs.status, "processando"))).returning({ id: schema.videoJobs.id });
      if (rows.length) failed.push(job.id);
    }
  }
  if (requeued.length || failed.length) console.warn(`[video] recuperação: reenfileirados ${requeued.length}, falharam ${failed.length}`);
  return { requeued, failed };
}
