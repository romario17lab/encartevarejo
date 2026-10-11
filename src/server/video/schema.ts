// Validação das opções de vídeo (API e worker) e token da página de cena.
import { z } from "zod";
import { signToken, verifyToken } from "@/server/signing";
import { NARRATION_MAX_CHARS } from "@/render/video/narration";
import type { VideoOptions } from "@/render/video/options";

/** novas tentativas automáticas além da primeira (fila e recuperação) */
export const VIDEO_RETRY_LIMIT = 2;

export const videoOptionsSchema = z.object({
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  style: z.enum(["deslizar", "zoom", "cortina", "subir"]).default("deslizar"),
  duration: z.union([z.literal("auto"), z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).default("auto"),
  audio: z.object({
    kind: z.enum(["none", "system", "upload"]).default("none"),
    assetId: z.string().max(60).nullish(),
    licenseConfirmed: z.boolean().optional(),
  }).default({ kind: "none" }),
  narration: z.object({
    provider: z.enum(["none", "google"]).default("none"),
    voice: z.string().max(60).nullish(),
    segments: z.array(z.object({ key: z.string().max(10), text: z.string().max(NARRATION_MAX_CHARS) })).max(80).optional(),
  }).default({ provider: "none" }),
});
export type VideoOptionsInput = z.infer<typeof videoOptionsSchema>;

/** Opções gravadas no pedido (video_jobs.options), lidas com tolerância. */
export function readJobOptions(raw: unknown): VideoOptions & { result?: VideoResultInfo; heartbeatAt?: string; canceledAt?: string; canceledBy?: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parsed = videoOptionsSchema.safeParse(r);
  const o = parsed.success ? parsed.data : videoOptionsSchema.parse({});
  const audio = (r.audio ?? {}) as Record<string, unknown>;
  return {
    style: o.style,
    duration: o.duration,
    audio: { ...o.audio, assetId: o.audio.assetId ?? null, confirmedBy: typeof audio.confirmedBy === "string" ? audio.confirmedBy : undefined, confirmedAt: typeof audio.confirmedAt === "string" ? audio.confirmedAt : undefined },
    narration: { provider: o.narration.provider, voice: o.narration.voice ?? null, segments: o.narration.segments },
    scale: typeof r.scale === "number" ? r.scale : undefined,
    fps: typeof r.fps === "number" ? r.fps : undefined,
    result: r.result as VideoResultInfo | undefined,
    heartbeatAt: typeof r.heartbeatAt === "string" ? r.heartbeatAt : undefined,
    canceledAt: typeof r.canceledAt === "string" ? r.canceledAt : undefined,
    canceledBy: typeof r.canceledBy === "string" ? r.canceledBy : undefined,
  };
}

export interface VideoResultInfo {
  width: number; height: number; fps: number; durationSec: number; codec: string; bytes: number; audio: boolean;
  shownItems: number; omitted: Array<{ id: string; name: string }>; warnings: string[];
}

// ------------------------------------------------------------------ token da cena (/render-video)

export interface VideoTokenPayload { cid: string; org: string; v: number }
export function signVideoToken(p: VideoTokenPayload, ttlSec = 1800): string {
  return signToken({ cid: p.cid, org: p.org, v: p.v, k: "video" }, ttlSec);
}
export function verifyVideoToken(token: string | null | undefined): VideoTokenPayload | null {
  const d = verifyToken<{ cid: unknown; org: unknown; v: unknown; k: unknown }>(token);
  if (!d || d.k !== "video" || typeof d.cid !== "string" || typeof d.org !== "string" || typeof d.v !== "number") return null;
  return { cid: d.cid, org: d.org, v: d.v };
}
