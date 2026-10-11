// Geração do MP4: abre a cena no Chromium (playwright-core), avança o relógio da animação quadro a
// quadro (window.__EV_VIDEO.seek — nada depende do tempo real), captura cada quadro e entrega ao
// ffmpeg (H.264, yuv420p, faststart). Depois mistura o áudio (opcional) e confere o arquivo final.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Page, Route } from "playwright-core";
import { getBrowser } from "@/server/export/browser";
import type { VideoSceneProps } from "@/render/video/Scene";
import { buildSceneDocument, resolveFontFile, SCENE_ORIGIN } from "./document";
import { ffmpeg, ffmpegPath, isFaststart, probe, type MediaInfo } from "./ffmpeg";

/** Falha com mensagem amigável (pt-BR). `retryable` = vale tentar de novo automaticamente. */
export class VideoFailure extends Error {
  constructor(public readonly userMessage: string, public readonly retryable: boolean, technical?: string) {
    super(technical ?? userMessage);
  }
}
/** O pedido foi cancelado durante a geração. */
export class VideoCancelled extends Error {
  constructor() { super("cancelado"); }
}

export type AssetResolver = (assetId: string, token: string | null) => Promise<{ data: Buffer; mime: string } | null>;

export interface RenderInput {
  scene: VideoSceneProps;
  /** arquivo MP4 de saída (somente vídeo) */
  outFile: string;
  /** fração do tamanho final (1 = 1080×1920 / 1920×1080). Menor só para testes/rascunhos. */
  scale?: number;
  /** imagens privadas (/api/assets/:id?t=) servidas sem passar pela rede */
  resolveAsset?: AssetResolver;
  /** progresso 0..1; devolver false cancela */
  onProgress?: (fraction: number) => Promise<boolean | void> | boolean | void;
  /** guarda de consistência: versão e preços esperados na página */
  expect?: { version: string; offers: string };
  timeoutMs?: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function routeAll(route: Route, html: string, resolveAsset?: AssetResolver) {
  const req = route.request();
  const url = new URL(req.url());
  if (url.origin !== SCENE_ORIGIN) return route.abort("blockedbyclient"); // nada de rede externa
  if (url.pathname === "/scene") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  const font = resolveFontFile(url.pathname);
  if (font) return route.fulfill({ status: 200, contentType: font.endsWith(".woff2") ? "font/woff2" : "font/woff", body: await readFile(font) });
  const asset = /^\/api\/assets\/([^/]+)$/.exec(url.pathname);
  if (asset && resolveAsset) {
    const r = await resolveAsset(decodeURIComponent(asset[1]), url.searchParams.get("t")).catch(() => null);
    if (r) return route.fulfill({ status: 200, contentType: r.mime, body: r.data });
  }
  return route.fulfill({ status: 404, body: "" });
}

/** Abre a cena e espera fontes e imagens. Devolve quantas imagens falharam. */
async function openScene(page: Page, input: RenderInput, html: string): Promise<{ imageErrors: number }> {
  await page.route("**/*", (r) => routeAll(r, html, input.resolveAsset));
  const timeout = input.timeoutMs ?? 90_000;
  try {
    await page.goto(`${SCENE_ORIGIN}/scene`, { waitUntil: "load", timeout });
    await page.waitForFunction(() => (window as unknown as { __EV_READY?: boolean }).__EV_READY === true, null, { timeout });
  } catch (e) {
    throw new VideoFailure("A cena do vídeo demorou demais para carregar (imagens ou fontes). Tente novamente.", true, `open scene: ${(e as Error).message}`);
  }
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-v-stage]");
    return {
      version: root?.dataset.evVersion ?? null,
      offers: root?.dataset.evOffers ?? null,
      api: typeof (window as unknown as { __EV_VIDEO?: unknown }).__EV_VIDEO === "object",
      imgErrors: ((window as unknown as { __EV_IMG_ERRORS?: string[] }).__EV_IMG_ERRORS ?? []).length,
    };
  });
  if (!state.api) throw new VideoFailure("Não foi possível preparar a animação do vídeo.", false, "runtime ausente");
  if (input.expect && (state.version !== input.expect.version || state.offers !== input.expect.offers))
    throw new VideoFailure("Os preços da campanha mudaram durante a geração do vídeo. Gere o vídeo novamente.", false, `fingerprint ${state.version}/${input.expect.version}`);
  return { imageErrors: state.imgErrors };
}

export interface RenderResult { frames: number; width: number; height: number; fps: number; durationSec: number; imageErrors: number }

/** Captura todos os quadros e codifica o MP4 (sem áudio). */
export async function renderVideoFrames(input: RenderInput): Promise<RenderResult> {
  const { plan } = input.scene;
  const scale = Math.min(1, Math.max(0.1, input.scale ?? 1));
  const W = plan.width, H = plan.height;
  const outW = even(W * scale), outH = even(H * scale);
  const fps = plan.fps;
  const frames = Math.round(plan.durationSec * fps);
  const html = buildSceneDocument({ ...input.scene, preview: false });

  const browser = await getBrowser().catch((e) => { throw new VideoFailure("O gerador de vídeos está indisponível no momento. Tente novamente em alguns minutos.", true, `browser: ${(e as Error).message}`); });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "light" });
  const enc = spawn(ffmpegPath(), [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-vf", `scale=${outW}:${outH}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", process.env.VIDEO_X264_PRESET || "medium", "-crf", "20", "-profile:v", "high",
    "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps * 2), "-movflags", "+faststart", "-an", input.outFile,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let encErr = "";
  enc.stderr.on("data", (d) => { encErr += d; if (encErr.length > 20_000) encErr = encErr.slice(-10_000); });
  const encDone = new Promise<void>((resolve, reject) => {
    enc.on("error", (e) => reject(new VideoFailure("O codificador de vídeo (ffmpeg) não está disponível no servidor.", false, e.message)));
    enc.on("close", (code) => (code === 0 ? resolve() : reject(new VideoFailure("Não foi possível codificar o vídeo. Tente novamente.", true, `ffmpeg ${code}: ${encErr}`))));
  });
  encDone.catch(() => undefined);
  const write = (buf: Buffer) => new Promise<void>((resolve, reject) => {
    if (enc.stdin.destroyed) { reject(new VideoFailure("O codificador de vídeo parou inesperadamente.", true, encErr)); return; }
    enc.stdin.write(buf, (e) => (e ? reject(new VideoFailure("O codificador de vídeo parou inesperadamente.", true, `${e.message} ${encErr}`)) : resolve()));
  });

  let imageErrors = 0;
  try {
    const page = await ctx.newPage();
    ({ imageErrors } = await openScene(page, input, html));
    const cdp = await ctx.newCDPSession(page);
    for (let f = 0; f < frames; f++) {
      const t = f / fps;
      await page.evaluate((tt) => { (window as unknown as { __EV_VIDEO: { seek: (t: number) => number } }).__EV_VIDEO.seek(tt); }, t);
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, captureBeyondViewport: false, optimizeForSpeed: true }) as { data: string };
      await write(Buffer.from(shot.data, "base64"));
      if (input.onProgress && (f % Math.max(1, Math.round(fps / 2)) === 0 || f === frames - 1)) {
        const keep = await input.onProgress((f + 1) / frames);
        if (keep === false) throw new VideoCancelled();
      }
    }
    enc.stdin.end();
    await encDone;
  } catch (e) {
    enc.stdin.destroy();
    enc.kill("SIGKILL");
    throw e;
  } finally {
    await ctx.close().catch(() => undefined);
  }
  return { frames, width: outW, height: outH, fps, durationSec: plan.durationSec, imageErrors };
}

/** Junta vídeo e áudio (cópia do vídeo, sem recodificar) mantendo faststart. */
export async function muxAudio(videoFile: string, audioFile: string, out: string): Promise<void> {
  await ffmpeg(["-i", videoFile, "-i", audioFile, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", out], 180_000);
}

/** Confere o arquivo final (codec, formato de cor, dimensões, duração e faststart). */
export async function verifyMp4(file: string, exp: { width: number; height: number; durationSec: number; audio: boolean }): Promise<MediaInfo> {
  const info = await probe(file);
  const head = (await readFile(file)).subarray(0, 1 << 20);
  info.faststart = isFaststart(head);
  const v = info.video;
  const problems: string[] = [];
  if (!v || v.codec !== "h264") problems.push(`codec ${v?.codec}`);
  if (v && v.pixFmt !== "yuv420p") problems.push(`pix_fmt ${v.pixFmt}`);
  if (v && (v.width !== exp.width || v.height !== exp.height)) problems.push(`${v.width}x${v.height}`);
  if (Math.abs(info.durationSec - exp.durationSec) > 0.25) problems.push(`duração ${info.durationSec}`);
  if (exp.audio && !info.audio) problems.push("sem faixa de áudio");
  if (!info.faststart) problems.push("sem faststart");
  if (problems.length) throw new VideoFailure("O vídeo gerado não passou na verificação final. Tente novamente.", true, `verify: ${problems.join(", ")}`);
  return info;
}
