// Geração REAL de vídeo: cena animada no Chromium (playwright-core) + ffmpeg (H.264) + trilha do sistema.
// Sem servidor Next nem banco: usa os dados de demonstração e o mesmo pipeline do worker (renderVideoFrames,
// mixAudio, muxAudio, verifyMp4). Baixa resolução (25%) e 10 quadros/s para ser rápido.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { demoCampaign } from "@/templates/demo-data";
import { getTemplate } from "@/templates/registry";
import { planVideo } from "@/render/video/plan";
import { buildTimeline, priceHoldSeconds } from "@/render/video/timeline";
import { renderVideoFrames, muxAudio, verifyMp4 } from "@/server/video/render";
import { mixAudio, synthSoundtrack } from "@/server/video/audio";
import { ffmpeg, ffmpegAvailable, isFaststart, probe } from "@/server/video/ffmpeg";
import { closeBrowser } from "@/server/export/browser";

let dir = "";
let hasFfmpeg = false;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ev-video-test-"));
  hasFfmpeg = await ffmpegAvailable();
});
afterAll(async () => {
  await closeBrowser();
  await rm(dir, { recursive: true, force: true });
});

describe("vídeo de ofertas — geração real", () => {
  it("ffmpeg com libx264 e aac está instalado (dependência do servidor)", () => {
    expect(hasFfmpeg).toBe(true);
  });

  it("gera MP4 vertical H.264 yuv420p com faststart, duração e resolução corretas, com trilha do sistema", async () => {
    const campaign = demoCampaign(3, { withLogo: true, highlights: 1 });
    const template = getTemplate("feira-da-semana")!;
    const plan = planVideo({ items: campaign.items, orientation: "vertical", style: "zoom", duration: "auto", fps: 10 });
    const D = plan.durationSec;
    expect(D).toBeGreaterThanOrEqual(10);
    expect(D).toBeLessThanOrEqual(16);
    expect(plan.omitted).toEqual([]);
    const silent = path.join(dir, "v.mp4");
    const r = await renderVideoFrames({ scene: { campaign, template, plan }, outFile: silent, scale: 0.25, expect: undefined });
    expect(r).toMatchObject({ frames: D * 10, width: 270, height: 480, imageErrors: 0 });

    const wav = path.join(dir, "trilha.wav");
    await synthSoundtrack(wav, plan.durationSec);
    const m4a = path.join(dir, "a.m4a");
    await mixAudio({ out: m4a, durationSec: plan.durationSec, music: { file: wav, loop: false } });
    const final = path.join(dir, "final.mp4");
    await muxAudio(silent, m4a, final);
    const info = await verifyMp4(final, { width: 270, height: 480, durationSec: D, audio: true });
    expect(info.video).toMatchObject({ codec: "h264", pixFmt: "yuv420p", width: 270, height: 480, fps: 10 });
    expect(info.audio).toMatchObject({ codec: "aac", channels: 2 });
    expect(Math.abs(info.durationSec - D)).toBeLessThan(0.15);
    expect(isFaststart(await readFile(final))).toBe(true);

    // quadros diferentes ao longo do tempo (há animação) e iguais quando renderizados de novo (determinístico)
    const frameAt = async (file: string, t: number) => {
      const out = path.join(dir, `f-${path.basename(file)}-${t}.png`);
      await ffmpeg(["-ss", String(t), "-i", file, "-frames:v", "1", out]);
      return readFile(out);
    };
    const a = await frameAt(final, 0.5), b = await frameAt(final, 4.5);
    const again = path.join(dir, "v2.mp4");
    await renderVideoFrames({ scene: { campaign, template, plan }, outFile: again, scale: 0.25 });
    const [p1, p2] = await Promise.all([probe(silent), probe(again)]);
    expect(p2.durationSec).toBe(p1.durationSec);
    // mesmo instante → mesma imagem (diferença média de pixel desprezível; o H.264 é com perdas)
    const raw = async (buf: Buffer) => sharp(buf).greyscale().raw().toBuffer();
    const [x, y] = await Promise.all([raw(await frameAt(again, 4.5)), raw(await frameAt(silent, 4.5))]);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff += Math.abs(x[i] - y[i]);
    expect(diff / x.length).toBeLessThan(1.5);
    const [m, n] = await Promise.all([raw(a), raw(b)]);
    let moved = 0;
    for (let i = 0; i < m.length; i++) moved += Math.abs(m[i] - n[i]);
    expect(moved / m.length).toBeGreaterThan(5);
  }, 240_000);

  it("gera MP4 horizontal 1920×1080 proporcional (sem áudio) e cada preço fica parado ≥ 1,5 s", async () => {
    const campaign = demoCampaign(4, { highlights: 1 });
    const template = getTemplate("mega-ofertas")!;
    const plan = planVideo({ items: campaign.items, orientation: "horizontal", style: "cortina", duration: "auto", fps: 10 });
    for (const h of priceHoldSeconds(buildTimeline(plan))) expect(h.seconds, h.id).toBeGreaterThanOrEqual(1.5);
    const out = path.join(dir, "h.mp4");
    const r = await renderVideoFrames({ scene: { campaign, template, plan }, outFile: out, scale: 0.25 });
    const info = await verifyMp4(out, { width: r.width, height: r.height, durationSec: plan.durationSec, audio: false });
    expect(info.video).toMatchObject({ codec: "h264", width: 480, height: 270 });
    expect(info.audio).toBeNull();
  }, 240_000);
});
