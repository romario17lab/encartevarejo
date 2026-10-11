// Serviço de vídeos de ofertas (API). Isolado por conta: toda consulta filtra por ctx.orgId.
// Fluxo: prévia (plano + URL assinada da cena animada) → pedido (fila) → worker gera o MP4 →
// download privado. Consumo do plano em segundos de vídeo (assertUsage antes, recordUsage no sucesso).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, sum } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, schema } from "@/server/db";
import type { TenantCtx } from "@/server/context";
import { AppError, notFound } from "@/server/errors";
import { newId } from "@/server/ids";
import { sha256 } from "@/server/signing";
import { storage } from "@/server/storage";
import { canAccessStore } from "@/server/tenant";
import { writeAudit } from "@/server/audit";
import { assertUsage, getOrgPlan, monthlyUsage } from "@/server/services/plans";
import { loadRenderBundle, type RenderBundle } from "@/server/services/render-data";
import { getTemplate } from "@/templates/registry";
import { defaultNarration } from "@/render/video/narration";
import { AUDIO_LABEL, VIDEO_STYLES, type VideoOrientation } from "@/render/video/options";
import type { VideoPlan } from "@/render/video/plan";
import { probe } from "@/server/video/ffmpeg";
import { discardAsset } from "@/server/video/files";
import { planForBundle } from "@/server/video/plan-bundle";
import { readJobOptions, signVideoToken, videoOptionsSchema, type VideoOptionsInput } from "@/server/video/schema";
import { getTtsProvider, ttsStatus } from "@/server/video/tts";

type JobRow = typeof schema.videoJobs.$inferSelect;
const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
const newVideoId = () => `vid_${nano()}`;

export const VIDEO_STATUS_LABEL = { na_fila: "Na fila", processando: "Gerando vídeo", concluida: "Pronto", falhou: "Falhou" } as const;
export const AUDIO_MAX_BYTES = 15 * 1024 * 1024;

export function videoJobDto(job: JobRow, fileName?: string | null) {
  const o = readJobOptions(job.options);
  const ready = job.status === "concluida" && !!job.outputAssetId;
  return {
    id: job.id,
    campaignId: job.campaignId,
    campaignVersion: job.campaignVersion,
    orientation: job.orientation,
    style: o.style,
    styleLabel: VIDEO_STYLES[o.style]?.label ?? o.style,
    durationChoice: o.duration,
    durationSec: job.durationSec,
    audio: o.audio.kind,
    audioLabel: AUDIO_LABEL[o.audio.kind],
    narration: o.narration.provider !== "none",
    status: job.status,
    statusLabel: o.canceledAt && job.status === "falhou" ? "Cancelado" : VIDEO_STATUS_LABEL[job.status],
    canceled: !!o.canceledAt,
    progress: job.status === "concluida" ? 100 : job.progress,
    attempts: job.attempts,
    error: job.error,
    result: o.result ?? null,
    warnings: o.result?.warnings ?? [],
    fileName: fileName ?? null,
    downloadUrl: ready ? `/api/videos/${job.id}/download` : null,
    playUrl: ready ? `/api/videos/${job.id}/download?inline=1` : null,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}
export type VideoJobDto = ReturnType<typeof videoJobDto>;

async function bundleFor(ctx: TenantCtx, campaignId: string): Promise<RenderBundle> {
  const bundle = await loadRenderBundle({ orgId: ctx.orgId }, campaignId, { version: "current", signedUrlTtlSec: 1800 });
  if (!canAccessStore(ctx, bundle.storeId)) throw new AppError("forbidden", "Você não tem acesso a esta loja.");
  return bundle;
}

function planSummary(plan: VideoPlan, bundle: RenderBundle) {
  const names = new Map(bundle.campaign.items.map((i) => [i.id, i.name]));
  return {
    orientation: plan.orientation, style: plan.style, durationSec: plan.durationSec, fps: plan.fps, width: plan.width, height: plan.height,
    scenes: plan.scenes.map((s) => ({ key: s.key, kind: s.kind, start: s.start, end: s.end, repeat: !!s.repeat, items: s.itemIds.map((id) => names.get(id) ?? id) })),
    shownCount: plan.shownItemIds.length, omitted: plan.omitted, warnings: plan.warnings,
  };
}

/** Segundos de vídeo já reservados por pedidos ainda em andamento (contam no limite antes de terminar). */
async function pendingSeconds(orgId: string): Promise<number> {
  const [r] = await getDb().select({ s: sum(schema.videoJobs.durationSec) }).from(schema.videoJobs)
    .where(and(eq(schema.videoJobs.orgId, orgId), inArray(schema.videoJobs.status, ["na_fila", "processando"])));
  return Number(r?.s ?? 0);
}

/** Limite de minutos do plano: 0 = vídeos não incluídos (mensagem clara). */
async function assertVideoAllowance(orgId: string, seconds: number) {
  const plan = await getOrgPlan(orgId);
  if (!plan.limits.videoMinutesPerMonth)
    throw new AppError("limit_reached", `O plano ${plan.name} não inclui vídeos. Altere o plano da conta para gerar vídeos de ofertas.`, { kind: "video_second", limit: 0 });
  const pending = await pendingSeconds(orgId);
  try {
    await assertUsage(orgId, "video_second", seconds + pending);
  } catch (e) {
    if (e instanceof AppError && e.code === "limit_reached") {
      const u = await monthlyUsage(orgId);
      const left = Math.max(0, plan.limits.videoMinutesPerMonth * 60 - u.videoSecondsThisMonth - pending);
      throw new AppError("limit_reached", `Este vídeo tem ${seconds} s, mas restam ${left} s de vídeo no plano ${plan.name} neste mês${pending ? ` (contando ${pending} s de vídeos ainda na fila)` : ""}. Escolha uma duração menor ou altere o plano.`, { kind: "video_second", limit: plan.limits.videoMinutesPerMonth * 60, used: u.videoSecondsThisMonth, pending, left });
    }
    throw e;
  }
}

// ------------------------------------------------------------------ configuração e prévia

export async function videoConfig(ctx: TenantCtx) {
  const plan = await getOrgPlan(ctx.orgId);
  const u = await monthlyUsage(ctx.orgId);
  const pending = await pendingSeconds(ctx.orgId);
  const limit = plan.limits.videoMinutesPerMonth * 60;
  return {
    included: limit > 0,
    planName: plan.name,
    limitSeconds: limit,
    usedSeconds: u.videoSecondsThisMonth,
    pendingSeconds: pending,
    remainingSeconds: Math.max(0, limit - u.videoSecondsThisMonth - pending),
    tts: ttsStatus(),
  };
}

/** Prévia: plano (cenas, duração, itens fora) + URL assinada da cena animada + narração sugerida. */
export async function previewVideo(ctx: TenantCtx, campaignId: string, body: unknown) {
  const input = videoOptionsSchema.parse(body ?? {});
  const bundle = await bundleFor(ctx, campaignId);
  const plan = planForBundle(bundle, { orientation: input.orientation, style: input.style, duration: input.duration });
  const t = signVideoToken({ cid: campaignId, org: ctx.orgId, v: bundle.version }, 1800);
  const q = new URLSearchParams({ o: input.orientation, s: input.style, d: String(input.duration), v: String(bundle.version), preview: "1", t });
  const errors = bundle.issues.filter((i) => i.level === "error");
  return {
    campaignVersion: bundle.version,
    url: `/render-video/${encodeURIComponent(campaignId)}?${q.toString()}`,
    plan: planSummary(plan, bundle),
    narration: defaultNarration(bundle.campaign, plan),
    blockedReason: errors.length ? `Corrija as ofertas antes de gerar o vídeo: ${errors.slice(0, 3).map((e) => `“${e.name}” — ${e.message}`).join("; ")}` : null,
  };
}

// ------------------------------------------------------------------ pedidos

async function validateAudio(ctx: TenantCtx, input: VideoOptionsInput) {
  if (input.audio.kind !== "upload") return null;
  if (!input.audio.assetId) throw new AppError("validation", "Envie o arquivo de áudio próprio ou escolha outra opção de áudio.");
  if (input.audio.licenseConfirmed !== true) throw new AppError("validation", "Para usar áudio próprio, confirme que a loja tem a licença de uso deste áudio.");
  const [a] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, input.audio.assetId), eq(schema.assets.orgId, ctx.orgId)));
  if (!a || !a.mime.startsWith("audio/")) throw new AppError("validation", "O áudio enviado não foi encontrado. Envie o arquivo novamente.");
  return a;
}

export async function createVideoJob(ctx: TenantCtx, campaignId: string, body: unknown): Promise<VideoJobDto> {
  const input = videoOptionsSchema.parse(body ?? {});
  const bundle = await bundleFor(ctx, campaignId);
  const errors = bundle.issues.filter((i) => i.level === "error");
  if (errors.length) {
    const list = errors.map((e) => `“${e.name}”: ${e.message}`);
    throw new AppError("validation", `Não é possível gerar o vídeo enquanto houver erros nas ofertas. Corrija: ${list.slice(0, 6).join(" · ")}${list.length > 6 ? ` · e mais ${list.length - 6}` : ""}`, { issues: errors });
  }
  if (!getTemplate(bundle.templateId, bundle.templateVersion)) throw new AppError("validation", "O modelo desta campanha não está disponível. Escolha outro modelo antes de gerar o vídeo.");
  const plan = planForBundle(bundle, { orientation: input.orientation, style: input.style, duration: input.duration });
  if (!plan.shownItemIds.length) throw new AppError("validation", "A campanha não tem produtos para mostrar no vídeo.");
  if (input.narration.provider !== "none" && !getTtsProvider(input.narration.provider).configured())
    throw new AppError("validation", "A narração não está configurada nesta instalação. Gere o vídeo sem narração.");
  await validateAudio(ctx, input);
  await assertVideoAllowance(ctx.orgId, plan.durationSec);

  const now = new Date().toISOString();
  const options: Record<string, unknown> = {
    style: input.style,
    duration: input.duration,
    audio: input.audio.kind === "upload"
      ? { kind: "upload", assetId: input.audio.assetId, licenseConfirmed: true, confirmedBy: ctx.userId, confirmedAt: now }
      : { kind: input.audio.kind },
    narration: input.narration.provider === "none" ? { provider: "none" } : {
      provider: input.narration.provider, voice: input.narration.voice ?? null,
      segments: (input.narration.segments ?? defaultNarration(bundle.campaign, plan)).map((s) => ({ key: s.key, text: s.text.trim() })),
    },
  };
  const db = getDb();
  const id = newVideoId();
  await db.insert(schema.videoJobs).values({
    id, orgId: ctx.orgId, campaignId, campaignVersion: bundle.version, orientation: input.orientation, options, durationSec: plan.durationSec, status: "na_fila", createdBy: ctx.userId,
  });
  await writeAudit(db, {
    orgId: ctx.orgId, userId: ctx.userId, action: "video.create", entityType: "campaign", entityId: campaignId,
    summary: `Vídeo solicitado (versão ${bundle.version}): ${input.orientation === "vertical" ? "vertical" : "horizontal"}, ${plan.durationSec} s, ${VIDEO_STYLES[input.style].label}, ${AUDIO_LABEL[input.audio.kind]}${input.audio.kind === "upload" ? " (licença declarada pela loja)" : ""}${input.narration.provider !== "none" ? ", com narração" : ""}`,
    data: { videoJobId: id, version: bundle.version, options },
  });
  await dispatch(ctx.orgId, id);
  return getVideoJob(ctx, id);
}

/** Enfileira (worker) ou executa dentro do processo (VIDEO_INLINE=1, desenvolvimento). */
async function dispatch(orgId: string, id: string) {
  const inline = (process.env.VIDEO_INLINE ?? process.env.EXPORT_INLINE) === "1";
  if (inline) {
    // processo separado: o gerador (Chromium + ffmpeg) não entra no servidor web
    try {
      const { spawn } = await import("node:child_process");
      const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), path.join(process.cwd(), "src", "worker", "video-run-once.ts"), id], { cwd: process.cwd(), env: process.env, stdio: "inherit", detached: true });
      child.unref();
    } catch (e) {
      console.error("[video] execução em processo falhou:", (e as Error).message);
    }
    return;
  }
  try {
    const { enqueueVideo } = await import("@/worker/video-queue");
    await enqueueVideo(id);
  } catch (e) {
    console.error("[video] falha ao enfileirar:", (e as Error).message);
    await getDb().update(schema.videoJobs).set({ status: "falhou", error: "Não foi possível colocar o vídeo na fila. Tente novamente.", finishedAt: new Date() })
      .where(and(eq(schema.videoJobs.id, id), eq(schema.videoJobs.orgId, orgId)));
  }
}

export async function getVideoJobRow(ctx: Pick<TenantCtx, "orgId">, id: string): Promise<JobRow> {
  const [job] = await getDb().select().from(schema.videoJobs).where(and(eq(schema.videoJobs.id, id), eq(schema.videoJobs.orgId, ctx.orgId)));
  if (!job) throw notFound("Vídeo");
  return job;
}

async function fileNameOf(job: JobRow): Promise<string | null> {
  if (!job.outputAssetId) return null;
  const [a] = await getDb().select({ name: schema.assets.originalName }).from(schema.assets)
    .where(and(eq(schema.assets.id, job.outputAssetId), eq(schema.assets.orgId, job.orgId)));
  return a?.name ?? null;
}

export async function getVideoJob(ctx: Pick<TenantCtx, "orgId">, id: string): Promise<VideoJobDto> {
  const job = await getVideoJobRow(ctx, id);
  return videoJobDto(job, await fileNameOf(job));
}

export async function listVideoJobs(ctx: Pick<TenantCtx, "orgId">, campaignId?: string | null): Promise<VideoJobDto[]> {
  const where = campaignId
    ? and(eq(schema.videoJobs.orgId, ctx.orgId), eq(schema.videoJobs.campaignId, campaignId))
    : eq(schema.videoJobs.orgId, ctx.orgId);
  const rows = await getDb().select({ job: schema.videoJobs, fileName: schema.assets.originalName }).from(schema.videoJobs)
    .leftJoin(schema.assets, and(eq(schema.assets.id, schema.videoJobs.outputAssetId), eq(schema.assets.orgId, schema.videoJobs.orgId)))
    .where(where).orderBy(desc(schema.videoJobs.createdAt)).limit(30);
  return rows.map((r) => videoJobDto(r.job, r.fileName));
}

export async function getVideoDownload(ctx: Pick<TenantCtx, "orgId">, id: string) {
  const job = await getVideoJobRow(ctx, id);
  if (job.status !== "concluida" || !job.outputAssetId) throw new AppError("conflict", "Este vídeo ainda não está pronto.");
  const [asset] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, job.outputAssetId), eq(schema.assets.orgId, ctx.orgId)));
  if (!asset) throw notFound("Arquivo do vídeo");
  return { asset, fileName: asset.originalName ?? `video-${job.id}.mp4` };
}

/** Tentar de novo um vídeo que falhou (o limite do plano é conferido outra vez). */
export async function retryVideoJob(ctx: TenantCtx, id: string): Promise<VideoJobDto> {
  const job = await getVideoJobRow(ctx, id);
  if (job.status !== "falhou") throw new AppError("conflict", job.status === "concluida" ? "Este vídeo já está pronto." : "Este vídeo ainda está em andamento.");
  const [c] = await getDb().select({ storeId: schema.campaigns.storeId }).from(schema.campaigns).where(and(eq(schema.campaigns.id, job.campaignId), eq(schema.campaigns.orgId, ctx.orgId)));
  if (!c) throw notFound("Campanha");
  if (!canAccessStore(ctx, c.storeId)) throw new AppError("forbidden", "Você não tem acesso a esta loja.");
  await assertVideoAllowance(ctx.orgId, job.durationSec);
  const db = getDb();
  const rows = await db.update(schema.videoJobs)
    .set({ status: "na_fila", attempts: 0, progress: 0, error: null, finishedAt: null, startedAt: null, options: readJobOptionsStripped(job.options) })
    .where(and(eq(schema.videoJobs.id, id), eq(schema.videoJobs.orgId, ctx.orgId), eq(schema.videoJobs.status, "falhou"))).returning({ id: schema.videoJobs.id });
  if (!rows.length) throw new AppError("conflict", "O vídeo mudou de estado. Atualize a lista.");
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "video.retry", entityType: "campaign", entityId: job.campaignId, summary: "Nova tentativa de gerar vídeo", data: { videoJobId: id } });
  await dispatch(ctx.orgId, id);
  return getVideoJob(ctx, id);
}

function readJobOptionsStripped(raw: unknown): Record<string, unknown> {
  const { canceledAt: _a, canceledBy: _b, heartbeatAt: _c, result: _d, ...rest } = (raw ?? {}) as Record<string, unknown>;
  return rest;
}

/** Cancela um vídeo na fila ou em geração; um vídeo já terminado (pronto ou com falha) é excluído com o arquivo. */
export async function cancelVideoJob(ctx: TenantCtx, id: string): Promise<{ ok: true; removed: boolean; job?: VideoJobDto }> {
  const job = await getVideoJobRow(ctx, id);
  const db = getDb();
  if (job.status === "na_fila" || job.status === "processando") {
    const opts = { ...(job.options ?? {}), canceledAt: new Date().toISOString(), canceledBy: ctx.userId };
    const rows = await db.update(schema.videoJobs).set({ status: "falhou", error: "Cancelado pelo usuário.", finishedAt: new Date(), options: opts })
      .where(and(eq(schema.videoJobs.id, id), eq(schema.videoJobs.orgId, ctx.orgId), inArray(schema.videoJobs.status, ["na_fila", "processando"]))).returning({ id: schema.videoJobs.id });
    if (!rows.length) throw new AppError("conflict", "O vídeo terminou enquanto você cancelava. Atualize a lista.");
    await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "video.cancel", entityType: "campaign", entityId: job.campaignId, summary: "Vídeo cancelado", data: { videoJobId: id } });
    return { ok: true, removed: false, job: await getVideoJob(ctx, id) };
  }
  if (job.outputAssetId) await discardAsset(ctx.orgId, job.outputAssetId);
  await db.delete(schema.videoJobs).where(and(eq(schema.videoJobs.id, id), eq(schema.videoJobs.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "video.delete", entityType: "campaign", entityId: job.campaignId, summary: "Vídeo excluído", data: { videoJobId: id } });
  return { ok: true, removed: true };
}

// ------------------------------------------------------------------ áudio próprio

const AUDIO_EXT: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg" };

/** Áudio próprio da loja: validado pelo conteúdo (ffprobe), até 15 MB e 10 minutos. Exige declaração de licença. */
export async function uploadVideoAudio(ctx: TenantCtx, up: { data: Buffer; name: string; type: string; licenseConfirmed: boolean }) {
  if (!up.licenseConfirmed) throw new AppError("validation", "Confirme que a loja tem a licença de uso deste áudio (músicas de terceiros precisam de autorização).");
  const ext = (up.name.split(".").pop() ?? "").toLowerCase();
  const mime = AUDIO_EXT[ext];
  if (!mime) throw new AppError("validation", "Formato de áudio não aceito. Envie MP3, M4A, AAC, WAV ou OGG.");
  if (up.data.length > AUDIO_MAX_BYTES) throw new AppError("validation", "Áudio grande demais (máximo 15 MB).");
  await assertUsage(ctx.orgId, "storage", up.data.length);
  const dir = await mkdtemp(path.join(tmpdir(), "ev-audio-"));
  let duration = 0;
  try {
    const f = path.join(dir, `a.${ext}`);
    await writeFile(f, up.data);
    const info = await probe(f).catch(() => null);
    if (!info?.audio) throw new AppError("validation", "Não reconhecemos este arquivo como áudio. Envie um MP3, M4A, WAV ou OGG válido.");
    duration = info.durationSec;
    if (duration < 1) throw new AppError("validation", "O áudio é curto demais (mínimo 1 segundo).");
    if (duration > 600) throw new AppError("validation", "O áudio é longo demais (máximo 10 minutos).");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  const id = newId("ast");
  const storageKey = `${ctx.orgId}/audio/${id}.${ext}`;
  await storage.put(storageKey, up.data, mime);
  const db = getDb();
  const safeName = up.name.replace(/[^\p{L}\p{N} ._()-]+/gu, "_").slice(0, 120);
  await db.insert(schema.assets).values({
    id, orgId: ctx.orgId, kind: "video", storageKey, mime, bytes: up.data.length, sha256: sha256(up.data), source: "upload_lojista",
    sourceNote: `Áudio para vídeo — licença de uso declarada pela loja (usuário ${ctx.userId}, ${new Date().toISOString()})`, originalName: safeName, createdBy: ctx.userId,
  });
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "video.audio_upload", entityType: "asset", entityId: id, summary: `Áudio próprio enviado (${safeName}) com declaração de licença`, data: { bytes: up.data.length, durationSec: duration } });
  return { id, name: safeName, durationSec: Math.round(duration * 10) / 10, bytes: up.data.length, licenseConfirmed: true };
}

export type { VideoOrientation };
