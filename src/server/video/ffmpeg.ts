// Chamadas ao ffmpeg/ffprobe (dependência de sistema: ffmpeg 6+ com libx264 e aac).
// Caminhos configuráveis por FFMPEG_PATH / FFPROBE_PATH. Sem shell: argumentos em lista.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const ffmpegPath = () => process.env.FFMPEG_PATH || "ffmpeg";
export const ffprobePath = () => process.env.FFPROBE_PATH || "ffprobe";

export class FfmpegError extends Error {
  constructor(message: string, public readonly stderr: string) { super(message); }
}

/** Executa e espera terminar. Rejeita com as últimas linhas do stderr. */
export function run(cmd: string, args: string[], opts: { timeoutMs?: number; input?: Buffer } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try { child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] }); } catch (e) { reject(new FfmpegError(`${cmd} indisponível: ${(e as Error).message}`, "")); return; }
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; if (out.length > 4_000_000) out = out.slice(-2_000_000); });
    child.stderr.on("data", (d) => { err += d; if (err.length > 200_000) err = err.slice(-100_000); });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs) : null;
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(new FfmpegError(`${cmd} indisponível: ${e.message}`, err)); });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new FfmpegError(`${cmd} terminou com ${signal ? `sinal ${signal}` : `código ${code}`}: ${err.trim().split("\n").slice(-6).join(" | ")}`, err));
    });
    if (opts.input) child.stdin.end(opts.input); else child.stdin.end();
  });
}

export const ffmpeg = (args: string[], timeoutMs = 10 * 60_000) => run(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { timeoutMs });

export interface MediaInfo {
  durationSec: number;
  video: { codec: string; width: number; height: number; pixFmt: string; fps: number; profile?: string } | null;
  audio: { codec: string; sampleRate: number; channels: number } | null;
  formatName: string;
  /** moov antes de mdat (faststart) */
  faststart?: boolean;
}

/** Lê duração, codecs e dimensões com ffprobe. */
export async function probe(file: string): Promise<MediaInfo> {
  const { stdout } = await run(ffprobePath(), ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { timeoutMs: 60_000 });
  const j = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string }; streams?: Array<Record<string, unknown>> };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const a = j.streams?.find((s) => s.codec_type === "audio");
  const rate = (r: unknown) => { const [n, d] = String(r ?? "0/1").split("/").map(Number); return d ? n / d : n; };
  return {
    durationSec: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0),
    formatName: j.format?.format_name ?? "",
    video: v ? { codec: String(v.codec_name), width: Number(v.width), height: Number(v.height), pixFmt: String(v.pix_fmt), fps: Math.round(rate(v.avg_frame_rate) * 100) / 100, profile: v.profile ? String(v.profile) : undefined } : null,
    audio: a ? { codec: String(a.codec_name), sampleRate: Number(a.sample_rate), channels: Number(a.channels) } : null,
  };
}

/** Confere se o átomo moov vem antes do mdat (reprodução progressiva / faststart). */
export function isFaststart(buf: Buffer): boolean {
  let off = 0;
  while (off + 8 <= buf.length) {
    const size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size < 8) return false;
    off += size;
  }
  return false;
}

/** ffmpeg disponível e com libx264? (usado na configuração e nos testes) */
export async function ffmpegAvailable(): Promise<boolean> {
  try {
    const { stdout } = await run(ffmpegPath(), ["-hide_banner", "-encoders"], { timeoutMs: 15_000 });
    return /libx264/.test(stdout) && /\baac\b/.test(stdout);
  } catch { return false; }
}
