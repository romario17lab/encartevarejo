// Áudio dos vídeos:
//  - "trilha gerada pelo sistema": música ORIGINAL e simples, sintetizada aqui mesmo com filtros do
//    ffmpeg (aevalsrc: acordes I–V–vi–IV, arpejo suave e marcação leve). Não usa gravação de terceiros,
//    portanto não há licença a pagar. Volume baixo, entrada e saída suaves.
//  - "áudio próprio": arquivo enviado pela loja (com declaração de licença), cortado/repetido no tempo do vídeo.
//  - narração (opcional): trechos por cena posicionados no início de cada cena; a música baixa por trás.
import { ffmpeg } from "./ffmpeg";

const BEAT = 0.625; // 96 bpm
const BAR = BEAT * 4;
// acordes (Hz): C, G/B, Am, F/A — vozes próximas para soar macio
const CHORDS: number[][] = [
  [261.63, 329.63, 392.0],
  [246.94, 293.66, 392.0],
  [220.0, 261.63, 329.63],
  [220.0, 261.63, 349.23],
];
const BASS = [130.81, 98.0, 110.0, 87.31];

const f2 = (n: number) => n.toFixed(2);

/** Expressão do aevalsrc da trilha (determinística; só funções matemáticas do ffmpeg). */
export function soundtrackExpression(): string {
  const C = `mod(floor(t/${BAR}),4)`;
  const sel = (vals: number[]) => `(${vals.map((v, i) => `${f2(v)}*eq(${C},${i})`).join("+")})`;
  const tb = `mod(t,${BAR})`;
  const padEnv = `min(1,${tb}/0.3)*min(1,(${BAR}-${tb})/0.3)`;
  const pad = [0, 1, 2].map((k) => `0.045*sin(2*PI*${sel(CHORDS.map((c) => c[k]))}*t)`).join("+");
  const bass = `0.06*sin(2*PI*${sel(BASS)}*t)*${padEnv}`;
  const STEP = BEAT / 2;
  const I = `mod(floor(t/${STEP}),4)`;
  const ta = `mod(t,${STEP})`;
  const arpTerms: string[] = [];
  CHORDS.forEach((c, ci) => {
    const notes = [c[0] * 2, c[1] * 2, c[2] * 2, c[1] * 2];
    notes.forEach((f, ii) => arpTerms.push(`${f2(f)}*eq(${C},${ci})*eq(${I},${ii})`));
  });
  const fa = `(${arpTerms.join("+")})`;
  const arpEnv = `exp(-7*${ta})*min(1,${ta}/0.004)*min(1,(${STEP}-${ta})/0.01)`;
  const arp = `0.07*(sin(2*PI*${fa}*t)+0.3*sin(4*PI*${fa}*t))*${arpEnv}`;
  const tk = `mod(t,${BEAT})`;
  const kick = `0.2*eq(mod(floor(t/${BEAT}),2),0)*sin(2*PI*(45*${tk}+55*(1-exp(-25*${tk}))/25))*exp(-9*${tk})`;
  return `(${pad})*${padEnv}+${bass}+${arp}+${kick}`;
}

/** Gera a trilha do sistema em WAV (mono 44,1 kHz) com a duração pedida. */
export async function synthSoundtrack(out: string, durationSec: number): Promise<void> {
  const D = Math.max(1, durationSec);
  const fadeOut = Math.min(1.5, D / 4);
  await ffmpeg([
    "-f", "lavfi", "-i", `aevalsrc=exprs='${soundtrackExpression()}':s=44100:d=${D.toFixed(3)}:c=mono`,
    "-af", `lowpass=f=4800,aecho=0.8:0.5:180:0.18,afade=t=in:d=0.6,afade=t=out:st=${(D - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)},volume=1.8,alimiter=limit=0.7`,
    "-c:a", "pcm_s16le", out,
  ], 120_000);
}

export interface NarrationClip { file: string; at: number; maxDur: number; tempo: number }

/**
 * Mistura música (opcional) e narração (opcional) numa faixa AAC com a duração exata do vídeo.
 * Música: trilha do sistema (WAV) ou arquivo próprio (repetido se for curto). Com narração a música fica mais baixa.
 */
export async function mixAudio(p: { out: string; durationSec: number; music?: { file: string; loop: boolean } | null; narration?: NarrationClip[] }): Promise<void> {
  const D = p.durationSec;
  const args: string[] = [];
  const parts: string[] = [];
  const labels: string[] = [];
  let idx = 0;
  const narr = p.narration ?? [];
  if (p.music) {
    if (p.music.loop) args.push("-stream_loop", "-1");
    args.push("-i", p.music.file);
    const vol = narr.length ? 0.32 : 0.85;
    const fo = Math.min(1.5, D / 4);
    parts.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${D.toFixed(3)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=in:d=0.3,afade=t=out:st=${(D - fo).toFixed(3)}:d=${fo.toFixed(3)}[m]`);
    labels.push("[m]");
    idx++;
  }
  narr.forEach((n, i) => {
    args.push("-i", n.file);
    const ms = Math.round(n.at * 1000);
    const tempo = Math.min(1.35, Math.max(1, n.tempo));
    const len = Math.max(0.3, n.maxDur);
    parts.push(`[${idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,${tempo > 1.001 ? `atempo=${tempo.toFixed(3)},` : ""}atrim=0:${len.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, len - 0.12).toFixed(3)}:d=0.12,adelay=${ms}|${ms}[n${i}]`);
    labels.push(`[n${i}]`);
    idx++;
  });
  if (!labels.length) throw new Error("mixAudio sem entradas");
  const mix = labels.length > 1 ? `${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,` : `${labels[0]}`;
  const tail = `apad=whole_dur=${D.toFixed(3)},atrim=0:${D.toFixed(3)},alimiter=limit=0.9[a]`;
  parts.push(labels.length > 1 ? `${mix}${tail}` : `${mix}${tail}`);
  await ffmpeg([...args, "-filter_complex", parts.join(";"), "-map", "[a]", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", p.out], 180_000);
}
