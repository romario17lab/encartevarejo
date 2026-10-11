// Vídeos de ofertas: tipos e constantes compartilhados (servidor, worker e interface).
// Sem importações de servidor: pode ser usado em componentes de cliente.
import type { FormatId } from "@/domain/formats";

export type VideoOrientation = "vertical" | "horizontal";
export type VideoStyle = "deslizar" | "zoom" | "cortina" | "subir";
export type DurationChoice = 15 | 30 | 45 | 60 | "auto";
export type AudioKind = "none" | "system" | "upload";
export type TtsProviderId = "none" | "google";

export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_DURATIONS: Array<Exclude<DurationChoice, "auto">> = [15, 30, 45, 60];

export const ORIENTATIONS: Record<VideoOrientation, { label: string; hint: string; width: number; height: number; format: FormatId }> = {
  vertical: { label: "Vertical", hint: "Stories, status e reels (1080×1920)", width: 1080, height: 1920, format: "story" },
  horizontal: { label: "Horizontal", hint: "TV da loja e YouTube (1920×1080)", width: 1920, height: 1080, format: "tv_horizontal" },
};

export const VIDEO_STYLES: Record<VideoStyle, { label: string; hint: string }> = {
  deslizar: { label: "Deslizar", hint: "Os produtos entram e saem pela lateral" },
  zoom: { label: "Zoom", hint: "Os produtos aparecem crescendo, com suavidade" },
  cortina: { label: "Cortina", hint: "Os produtos são revelados como uma cortina" },
  subir: { label: "Subir", hint: "Os produtos sobem de baixo para cima" },
};

export const AUDIO_LABEL: Record<AudioKind, string> = {
  none: "Sem áudio",
  system: "Trilha gerada pelo sistema",
  upload: "Áudio próprio",
};

export interface VideoAudioOption {
  kind: AudioKind;
  /** áudio próprio: arquivo enviado (assets) */
  assetId?: string | null;
  /** áudio próprio: a loja declarou que tem a licença de uso */
  licenseConfirmed?: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface NarrationSegment { key: string; text: string }

export interface VideoNarrationOption {
  provider: TtsProviderId;
  voice?: string | null;
  /** texto por cena (chaves: "intro", "s0", "s1"…, "outro"), revisado pelo usuário */
  segments?: NarrationSegment[];
}

/** Opções de um vídeo (gravadas em video_jobs.options). */
export interface VideoOptions {
  style: VideoStyle;
  duration: DurationChoice;
  audio: VideoAudioOption;
  narration: VideoNarrationOption;
  /** baixa resolução (somente testes/prévia rápida): fração do tamanho final */
  scale?: number;
  fps?: number;
}

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  style: "deslizar",
  duration: "auto",
  audio: { kind: "none" },
  narration: { provider: "none" },
};

export const DURATION_LABEL = (d: DurationChoice) => (d === "auto" ? "Automático" : `${d} s`);
