// Vídeos de ofertas: API (permissões, isolamento, limites do plano), fila (status, novas tentativas,
// recuperação, cancelamento), planejamento de duração e narração em pt-BR.
// A captura de quadros (Chromium) é substituída aqui por um MP4 sintético do ffmpeg com o mesmo tamanho e
// duração; a geração real é coberta em tests/generation/video.test.ts.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";

const enqueued: string[] = [];
vi.mock("@/worker/video-queue", () => ({ enqueueVideo: vi.fn(async (id: string) => { enqueued.push(id); }) }));

const renderMode = { fail: null as null | { retryable: boolean }, cancelAfterStart: false };
vi.mock("@/server/video/render", async (orig) => {
  const real = await orig<typeof import("@/server/video/render")>();
  return {
    ...real,
    renderVideoFrames: vi.fn(async (input: Parameters<typeof real.renderVideoFrames>[0]) => {
      const { plan } = input.scene;
      if (renderMode.cancelAfterStart && input.onProgress && (await input.onProgress(0.5)) === false) throw new real.VideoCancelled();
      if (renderMode.fail) throw new real.VideoFailure("Falha simulada de renderização.", renderMode.fail.retryable, "simulada");
      const scale = input.scale ?? 1;
      const w = Math.round((plan.width * scale) / 2) * 2, h = Math.round((plan.height * scale) / 2) * 2;
      const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${w}x${h}:rate=${plan.fps}:duration=${plan.durationSec}`,
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.outFile]);
      if (r.status !== 0) throw new Error(String(r.stderr));
      await input.onProgress?.(1);
      return { frames: plan.durationSec * plan.fps, width: w, height: h, fps: plan.fps, durationSec: plan.durationSec, imageErrors: 0 };
    }),
  };
});

const { getDb, schema } = await import("@/server/db");
const { createCampaign, saveCampaign } = await import("@/server/services/campaigns");
const { monthlyUsage } = await import("@/server/services/plans");
const { runVideoJob, sweepStuckVideos, VIDEO_STUCK_MS } = await import("@/server/video/run");
const { planVideo, sceneMin, T } = await import("@/render/video/plan");
const { buildTimeline, priceHoldSeconds } = await import("@/render/video/timeline");
const { spellCents, numberToWords, spokenItem, spokenValidity, defaultNarration } = await import("@/render/video/narration");
const { emptyOffer } = await import("@/domain/offer");
const videosRoute = await import("@/app/api/campaigns/[id]/videos/route");
const previewRoute = await import("@/app/api/campaigns/[id]/videos/preview/route");
const videoRoute = await import("@/app/api/videos/[id]/route");
const downloadRoute = await import("@/app/api/videos/[id]/download/route");
const retryRoute = await import("@/app/api/videos/[id]/retry/route");
const audioRoute = await import("@/app/api/videos/audio/route");
const configRoute = await import("@/app/api/videos/config/route");
const listRoute = await import("@/app/api/videos/route");
const { addMember, call, days, makeOrg, makeProduct, req, templateId } = await import("./helpers");

type Org = Awaited<ReturnType<typeof makeOrg>>;

async function setup(plan = "profissional") {
  const org = await makeOrg({ plan });
  const p1 = await makeProduct(org, { name: "Arroz tipo 1 5kg", unit: "pct", regularCents: 2990, promoCents: 2490 });
  const p2 = await makeProduct(org, { name: "Feijão carioca 1kg", unit: "pct", regularCents: 899, promoCents: 749 });
  const state = await createCampaign(org.ctx, {
    storeId: org.storeId, name: "Semana", templateId: templateId(), startsAt: days(-1).toISOString(), endsAt: days(6).toISOString(), productIds: [p1.id, p2.id],
  });
  return { org, cid: state.campaign.id, state };
}
const create = (org: Org, cid: string, body: unknown = { orientation: "vertical", duration: 15 }, token = org.token) =>
  call(videosRoute.POST, req("POST", `/api/campaigns/${cid}/videos`, { token, body }), { id: cid });
const jobRow = async (id: string) => (await getDb().select().from(schema.videoJobs).where(eq(schema.videoJobs.id, id)))[0]!;

beforeEach(() => { renderMode.fail = null; renderMode.cancelAfterStart = false; delete process.env.VIDEO_INLINE; delete process.env.EXPORT_INLINE; });

// ------------------------------------------------------------------ planejamento (puro)

const items = (n: number, hi = 0) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Produto ${i + 1}`, highlight: i >= n - hi }));

describe("planejamento da duração", () => {
  it("automático cresce com a quantidade de itens e nunca passa de 60 s", () => {
    const d = (n: number) => planVideo({ items: items(n), orientation: "vertical", style: "zoom", duration: "auto" }).durationSec;
    expect(d(1)).toBeGreaterThanOrEqual(T.AUTO_MIN);
    expect(d(4)).toBeGreaterThan(d(1));
    expect(d(12)).toBeGreaterThan(d(4));
    expect(d(80)).toBe(60);
  });

  it("duração escolhida é exata; destaques primeiro; quem não coube é nomeado", () => {
    const p = planVideo({ items: items(20, 2), orientation: "vertical", style: "deslizar", duration: 15 });
    expect(p.durationSec).toBe(15);
    expect(p.scenes[0].kind).toBe("intro");
    expect(p.scenes.at(-1)).toMatchObject({ kind: "outro", end: 15 });
    expect(p.scenes[1].itemIds).toEqual(["i18"]); // destaque sozinho e primeiro
    expect(p.scenes[2].itemIds).toEqual(["i19"]);
    expect(p.omitted.length).toBe(20 - p.shownItemIds.length);
    expect(p.omitted.length).toBeGreaterThan(0);
    expect(p.warnings.join(" ")).toMatch(/Ficaram de fora por falta de tempo: “Produto \d+”/);
    for (const s of p.scenes.filter((x) => x.kind === "products")) expect(s.end - s.start).toBeGreaterThanOrEqual(sceneMin(s.itemIds.length) - 1e-6);
  });

  it("60 s mostra mais produtos que 15 s; poucos produtos com duração longa repetem as cenas", () => {
    const short = planVideo({ items: items(30), orientation: "horizontal", style: "zoom", duration: 15 });
    const long = planVideo({ items: items(30), orientation: "horizontal", style: "zoom", duration: 60 });
    expect(long.shownItemIds.length).toBeGreaterThan(short.shownItemIds.length);
    const few = planVideo({ items: items(2), orientation: "vertical", style: "zoom", duration: 60 });
    expect(few.durationSec).toBe(60);
    expect(few.scenes.some((s) => s.repeat)).toBe(true);
    expect(few.omitted).toEqual([]);
  });

  it("itens pausados ficam de fora", () => {
    const p = planVideo({ items: items(3), pausedItemIds: ["i1"], orientation: "vertical", style: "zoom", duration: "auto" });
    expect(p.shownItemIds).not.toContain("i1");
  });

  it("todo preço fica parado e legível por ≥ 1,5 s em todos os estilos, formatos e durações", () => {
    for (const style of ["deslizar", "zoom", "cortina", "subir"] as const)
      for (const orientation of ["vertical", "horizontal"] as const)
        for (const duration of [15, 30, 60, "auto"] as const) {
          const tl = buildTimeline(planVideo({ items: items(9, 1), orientation, style, duration }));
          const holds = priceHoldSeconds(tl, 1 / 30);
          expect(holds.length).toBeGreaterThan(0);
          for (const h of holds) expect(h.seconds, `${style}/${orientation}/${duration}/${h.id}`).toBeGreaterThanOrEqual(1.5);
        }
  });
});

// ------------------------------------------------------------------ narração (puro)

describe("narração em pt-BR a partir dos dados", () => {
  it("valores por extenso", () => {
    expect(spellCents(1890)).toBe("dezoito reais e noventa centavos");
    expect(spellCents(100)).toBe("um real");
    expect(spellCents(90)).toBe("noventa centavos");
    expect(spellCents(101)).toBe("um real e um centavo");
    expect(spellCents(499)).toBe("quatro reais e noventa e nove centavos");
    expect(spellCents(123456)).toBe("mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
    expect(spellCents(110000)).toBe("mil e cem reais");
    expect(numberToWords(100)).toBe("cem");
    expect(numberToWords(115)).toBe("cento e quinze");
    expect(numberToWords(2000)).toBe("dois mil");
    expect(numberToWords(1_200_000)).toBe("um milhão e duzentos mil");
  });

  it("frase do produto com unidade, de/por, combo e clube", () => {
    const base = { name: "Picanha", sizeLabel: null, unit: "kg" as const };
    expect(spokenItem({ ...base, offer: { ...emptyOffer(), mode: "from_to", priceCents: 3990, regularCents: 4990 } }))
      .toBe("Picanha: de quarenta e nove reais e noventa centavos por trinta e nove reais e noventa centavos o quilo.");
    expect(spokenItem({ name: "Biscoito", sizeLabel: "Pacote 400g", unit: "pct", offer: { ...emptyOffer(), mode: "combo", comboQty: 3, comboCents: 1200 } }))
      .toBe("Biscoito, pacote de 400 gramas: leve 3 por doze reais.");
    expect(spokenItem({ ...base, offer: { ...emptyOffer(), mode: "club", priceCents: 4999, clubCents: 4290, clubName: "Clube Exemplo" } }))
      .toContain("ou quarenta e dois reais e noventa centavos no Clube Exemplo");
    expect(spokenValidity("Ofertas válidas de 15/10 a 18/10/2026")).toBe("Ofertas válidas de 15 de outubro a 18 de outubro");
  });

  it("texto padrão: uma frase por cena, com validade e “Imagens ilustrativas” no encerramento", () => {
    const campaign = {
      title: "Ofertas da Semana", validityText: "Ofertas válidas de 15/10 a 18/10/2026",
      brand: { storeName: "Mercado Exemplo", address: "Rua Exemplo, 123 · Centro" } as never,
      items: [{ id: "a", name: "Leite", sizeLabel: null, unit: "un", offer: { ...emptyOffer(), priceCents: 459 } }] as never,
    };
    const plan = planVideo({ items: [{ id: "a", name: "Leite", highlight: false }], orientation: "vertical", style: "zoom", duration: "auto" });
    const seg = defaultNarration(campaign, plan);
    expect(seg.map((s) => s.key)).toEqual(plan.scenes.map((s) => s.key));
    expect(seg[1].text).toBe("Leite: quatro reais e cinquenta e nove centavos a unidade.");
    expect(seg.at(-1)!.text).toMatch(/15 de outubro.*Mercado Exemplo.*Imagens ilustrativas\./);
  });
});

// ------------------------------------------------------------------ API

describe("API de vídeos", () => {
  it("exige sessão; prévia devolve plano, URL assinada e narração sugerida", async () => {
    const { org, cid } = await setup();
    expect((await create(org, cid, {}, null as unknown as string)).status).toBe(401);
    const pv = await call(previewRoute.POST, req("POST", `/api/campaigns/${cid}/videos/preview`, { token: org.token, body: { orientation: "horizontal", duration: 30, style: "cortina" } }), { id: cid });
    expect(pv.status).toBe(200);
    expect(pv.json.plan).toMatchObject({ durationSec: 30, orientation: "horizontal", shownCount: 2 });
    expect(pv.json.url).toMatch(/^\/render-video\/cmp_[a-z0-9]+\?o=horizontal&s=cortina&d=30&v=1&preview=1&t=/);
    expect(pv.json.narration[1].text).toMatch(/reais e noventa centavos/);
    const cfg = await call(configRoute.GET, req("GET", "/api/videos/config", { token: org.token }));
    expect(cfg.json).toMatchObject({ included: true, limitSeconds: 600, tts: { configured: false } });
  });

  it("plano sem vídeo: mensagem clara (402)", async () => {
    const { org, cid } = await setup("inicial");
    const r = await create(org, cid);
    expect(r.status).toBe(402);
    expect(r.json.error.message).toBe("O plano Inicial não inclui vídeos. Altere o plano da conta para gerar vídeos de ofertas.");
  });

  it("cria na fila, isola por conta e respeita a loja do membro", async () => {
    const { org, cid } = await setup();
    const r = await create(org, cid, { orientation: "vertical", duration: 15, style: "subir", audio: { kind: "system" } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ status: "na_fila", durationSec: 15, orientation: "vertical", style: "subir", audio: "system", downloadUrl: null });
    expect(enqueued).toContain(r.json.id);

    const other = await setup();
    for (const [h, m, u] of [[videoRoute.GET, "GET", ""], [downloadRoute.GET, "GET", "/download"], [retryRoute.POST, "POST", "/retry"], [videoRoute.DELETE, "DELETE", ""]] as const) {
      const x = await call(h, req(m, `/api/videos/${r.json.id}${u}`, { token: other.org.token }), { id: r.json.id });
      expect(x.status, `${m} ${u}`).toBe(404);
    }
    expect((await call(listRoute.GET, req("GET", "/api/videos", { token: other.org.token }))).json.videos).toEqual([]);
    expect((await create(other.org, cid)).status).toBe(404); // campanha de outra conta

    const restricted = await addMember(org, "editor", ["sto_outra"]);
    const f = await create(org, cid, { duration: 15 }, restricted.token);
    expect(f.status).toBe(403);
    const editor = await addMember(org, "editor");
    expect((await create(org, cid, { duration: 15 }, editor.token)).status).toBe(201);
  });

  it("limite de minutos conta os vídeos ainda na fila", async () => {
    const { org, cid } = await setup();
    for (let i = 0; i < 10; i++) expect((await create(org, cid, { duration: 60 })).status).toBe(201); // 600 s = 10 min
    const r = await create(org, cid, { duration: 15 });
    expect(r.status).toBe(402);
    expect(r.json.error.message).toMatch(/restam 0 s de vídeo no plano Profissional.*600 s de vídeos ainda na fila/);
  });

  it("ofertas com erro e narração sem serviço configurado são recusadas", async () => {
    const { org, cid, state } = await setup();
    expect((await create(org, cid, { duration: 15, narration: { provider: "google" } })).status).toBe(422);
    const bad = state.items.map((it, i) => (i === 0 ? { ...it, offer: { ...it.offer, priceCents: null } } : it));
    await saveCampaign(org.ctx, cid, { baseVersion: state.campaign.version, items: bad });
    const r = await create(org, cid);
    expect(r.status).toBe(422);
    expect(r.json.error.message).toMatch(/erros nas ofertas/);
  });

  it("áudio próprio: exige declaração de licença e arquivo de áudio válido", async () => {
    const { org, cid } = await setup();
    const dir = mkdtempSync(path.join(tmpdir(), "ev-aud-"));
    const wav = path.join(dir, "jingle.wav");
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", wav]);
    const form = (license: boolean, data: Buffer, name: string) => { const f = new FormData(); f.append("file", new Blob([new Uint8Array(data)]), name); if (license) f.append("licenseConfirmed", "true"); return f; };
    const no = await call(audioRoute.POST, req("POST", "/api/videos/audio", { token: org.token, form: form(false, readFileSync(wav), "jingle.wav") }));
    expect(no.status).toBe(422);
    expect(no.json.error.message).toMatch(/licença/);
    const fake = await call(audioRoute.POST, req("POST", "/api/videos/audio", { token: org.token, form: form(true, Buffer.from("isto não é áudio"), "x.mp3") }));
    expect(fake.status).toBe(422);
    const ok = await call(audioRoute.POST, req("POST", "/api/videos/audio", { token: org.token, form: form(true, readFileSync(wav), "jingle.wav") }));
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ licenseConfirmed: true, durationSec: 2 });
    expect((await create(org, cid, { duration: 15, audio: { kind: "upload", assetId: ok.json.id } })).status).toBe(422);
    const r = await create(org, cid, { duration: 15, audio: { kind: "upload", assetId: ok.json.id, licenseConfirmed: true } });
    expect(r.status).toBe(201);
    const row = await jobRow(r.json.id);
    expect(row.options).toMatchObject({ audio: { kind: "upload", assetId: ok.json.id, licenseConfirmed: true, confirmedBy: org.userId } });
    // a geração usa o áudio enviado (repetido/cortado no tempo do vídeo)
    expect(await runVideoJob(r.json.id)).toBe("concluida");
    expect((await jobRow(r.json.id)).options).toMatchObject({ result: { audio: true, durationSec: 15 } });
  });
});

// ------------------------------------------------------------------ fila e worker

describe("execução, novas tentativas e recuperação", () => {
  it("conclui, registra consumo em segundos e entrega o MP4 (com Range) só para a conta", async () => {
    const { org, cid } = await setup();
    const { json } = await create(org, cid, { orientation: "horizontal", duration: 15, audio: { kind: "system" } });
    const before = (await monthlyUsage(org.orgId)).videoSecondsThisMonth;
    expect(await runVideoJob(json.id)).toBe("concluida");
    expect(await runVideoJob(json.id)).toBe("ignorada"); // execução dupla não reprocessa
    const row = await jobRow(json.id);
    expect(row).toMatchObject({ status: "concluida", progress: 100, attempts: 1 });
    expect((await monthlyUsage(org.orgId)).videoSecondsThisMonth - before).toBe(15);
    const [asset] = await getDb().select().from(schema.assets).where(eq(schema.assets.id, row.outputAssetId!));
    expect(asset).toMatchObject({ kind: "video", mime: "video/mp4", width: 1920, height: 1080 });
    const dl = await call(downloadRoute.GET, req("GET", `/api/videos/${json.id}/download`, { token: org.token }), { id: json.id });
    expect(dl.status).toBe(200);
    expect(dl.res.headers.get("content-disposition")).toMatch(/attachment; filename="semana_video-horizontal_15s\.mp4"/);
    const part = await call(downloadRoute.GET, req("GET", `/api/videos/${json.id}/download?inline=1`, { token: org.token, headers: { range: "bytes=0-99" } }), { id: json.id });
    expect(part.status).toBe(206);
    expect(part.res.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    const st = await call(videoRoute.GET, req("GET", `/api/videos/${json.id}`, { token: org.token }), { id: json.id });
    expect(st.json).toMatchObject({ status: "concluida", statusLabel: "Pronto", downloadUrl: `/api/videos/${json.id}/download`, result: { width: 1920, height: 1080, codec: "h264", audio: true } });
    // excluir um vídeo pronto apaga o arquivo
    const del = await call(videoRoute.DELETE, req("DELETE", `/api/videos/${json.id}`, { token: org.token }), { id: json.id });
    expect(del.json).toMatchObject({ removed: true });
    expect(await getDb().select().from(schema.assets).where(eq(schema.assets.id, row.outputAssetId!))).toEqual([]);
  });

  it("falha instável volta para a fila (até 2 novas tentativas); falha final mostra mensagem e permite tentar de novo", async () => {
    const { org, cid } = await setup();
    const { json } = await create(org, cid);
    renderMode.fail = { retryable: true };
    await expect(runVideoJob(json.id, { finalAttempt: false })).rejects.toThrow();
    expect(await jobRow(json.id)).toMatchObject({ status: "na_fila", error: "Tentando novamente…", attempts: 1 });
    await expect(runVideoJob(json.id, { finalAttempt: false })).rejects.toThrow();
    expect(await runVideoJob(json.id, { finalAttempt: false })).toBe("falhou"); // 3ª tentativa = última
    expect(await jobRow(json.id)).toMatchObject({ status: "falhou", error: "Falha simulada de renderização.", attempts: 3 });

    renderMode.fail = null;
    enqueued.length = 0;
    const rt = await call(retryRoute.POST, req("POST", `/api/videos/${json.id}/retry`, { token: org.token }), { id: json.id });
    expect(rt.json).toMatchObject({ status: "na_fila", attempts: 0 });
    expect(enqueued).toEqual([json.id]);
    expect(await runVideoJob(json.id)).toBe("concluida");
    expect((await call(retryRoute.POST, req("POST", `/api/videos/${json.id}/retry`, { token: org.token }), { id: json.id })).status).toBe(409);
  });

  it("falha definitiva (não adianta repetir) vai direto para 'falhou'", async () => {
    const { org, cid } = await setup();
    const { json } = await create(org, cid);
    renderMode.fail = { retryable: false };
    expect(await runVideoJob(json.id, { finalAttempt: false })).toBe("falhou");
    expect(await jobRow(json.id)).toMatchObject({ status: "falhou", attempts: 1 });
  });

  it("cancelar durante a geração interrompe o trabalho", async () => {
    const { org, cid } = await setup();
    const { json } = await create(org, cid);
    const c = await call(videoRoute.DELETE, req("DELETE", `/api/videos/${json.id}`, { token: org.token }), { id: json.id });
    expect(c.json).toMatchObject({ removed: false, job: { status: "falhou", statusLabel: "Cancelado", canceled: true } });
    expect(await runVideoJob(json.id)).toBe("ignorada");

    const { json: j2 } = await create(org, cid);
    renderMode.cancelAfterStart = true;
    // simula o cancelamento chegando enquanto o worker gera
    const p = runVideoJob(j2.id);
    await getDb().update(schema.videoJobs).set({ status: "falhou", error: "Cancelado pelo usuário." }).where(eq(schema.videoJobs.id, j2.id));
    expect(await p).toBe("cancelada");
    expect(await jobRow(j2.id)).toMatchObject({ status: "falhou", error: "Cancelado pelo usuário.", outputAssetId: null });
  });

  it("recupera pedidos travados em 'processando' após queda do worker", async () => {
    const { org, cid } = await setup();
    const a = (await create(org, cid)).json.id;
    const b = (await create(org, cid)).json.id;
    const fresh = (await create(org, cid)).json.id;
    const old = new Date(Date.now() - VIDEO_STUCK_MS - 60_000);
    await getDb().update(schema.videoJobs).set({ status: "processando", attempts: 1, startedAt: old, options: { style: "zoom", duration: 15, heartbeatAt: old.toISOString() } }).where(eq(schema.videoJobs.id, a));
    await getDb().update(schema.videoJobs).set({ status: "processando", attempts: 3, startedAt: old }).where(eq(schema.videoJobs.id, b));
    await getDb().update(schema.videoJobs).set({ status: "processando", attempts: 1, startedAt: old, options: { heartbeatAt: new Date().toISOString() } }).where(eq(schema.videoJobs.id, fresh));
    const requeued: string[] = [];
    const r = await sweepStuckVideos(async (id) => { requeued.push(id); });
    expect(r.requeued).toContain(a);
    expect(r.failed).toContain(b);
    expect(r.requeued).not.toContain(fresh); // ainda dando sinal de vida
    expect(requeued).toContain(a);
    expect(await jobRow(a)).toMatchObject({ status: "na_fila" });
    expect(await jobRow(b)).toMatchObject({ status: "falhou", error: expect.stringMatching(/interrompido várias vezes/) });
    expect(await jobRow(fresh)).toMatchObject({ status: "processando" });
    expect(await runVideoJob(a)).toBe("concluida");
    const [usage] = await getDb().select().from(schema.usageEvents).where(and(eq(schema.usageEvents.orgId, org.orgId), eq(schema.usageEvents.ref, a)));
    expect(usage).toMatchObject({ kind: "video_second", quantity: 15 });
  });
});
