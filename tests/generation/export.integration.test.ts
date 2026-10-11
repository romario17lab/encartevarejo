// Integração da exportação: banco real (ev_gen), servidor Next real (/render) e Chromium real.
// Semeia os dados direto com drizzle (sem depender de serviços do Backend).
// Uso: npx vitest run --config tests/generation/vitest.config.ts tests/generation/export.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import sharp from "sharp";

// ---------- ambiente (antes de importar módulos do servidor) ----------
const ROOT = path.resolve(import.meta.dirname, "../..");
for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !/DATABASE_URL$/.test(m[1]) && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const PORT = Number(process.env.GEN_TEST_PORT ?? 3103);
const BASE = `http://127.0.0.1:${PORT}`;
// com a config raiz (npm test) usa o banco de teste recriado pelo global-setup; isolado, usa ev_gen
process.env.DATABASE_URL = process.env.GEN_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/ev_gen";
process.env.STORAGE_DIR = process.env.GEN_STORAGE_DIR ?? path.join(tmpdir(), "ev-gen-storage");
process.env.RENDER_BASE_URL = BASE;
process.env.APP_URL = BASE;
mkdirSync(process.env.STORAGE_DIR, { recursive: true });
const OUT = process.env.GEN_TEST_OUT ?? path.join(process.env.STORAGE_DIR, "_inspecao");
mkdirSync(OUT, { recursive: true });

const { getDb, getPool, schema } = await import("@/server/db");
const { runExportJob, generateExport } = await import("@/server/export/run");
const { createExportJob, getExportJob, listExportJobs } = await import("@/server/export/jobs");
const { closeBrowser, withPage } = await import("@/server/export/browser");
const { inspectPdf } = await import("@/server/export/verify");
const { signRenderToken, renderPath } = await import("@/server/export/render-token");
const { storage } = await import("@/server/storage");
const { listTemplates } = await import("@/templates/registry");
const { sweepStuckExports } = await import("@/worker/index");
const { stopBoss } = await import("@/worker/queue");
const { layoutPiece } = await import("@/layout/engine");
const { loadRenderBundle, effectiveOverrides, buildValidityText, formatHoursLine } = await import("@/server/services/render-data");
const { FORMATS } = await import("@/domain/formats");
const { emptyOffer } = await import("@/domain/offer");

const db = getDb();
const uid = Math.random().toString(36).slice(2, 8);
const ORG = `org_gen${uid}`, OTHER_ORG = `org_gnx${uid}`, USER = `usr_gen${uid}`, KIT = `brk_gen${uid}`, STORE = `sto_gen${uid}`, CMP = `cmp_gen${uid}`, BAD = `cmp_bad${uid}`;
const template = listTemplates()[0];
let server: ChildProcess | null = null;

async function serverUp(): Promise<boolean> {
  try { const r = await fetch(`${BASE}/render/x?f=story`, { signal: AbortSignal.timeout(60_000) }); return r.status < 500; } catch { return false; }
}

async function startServer() {
  if (await serverUp()) return;
  server = spawn("npx", ["next", "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true,
    env: { ...process.env, NEXT_DIST_DIR: ".next-gen", NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" },
  });
  let log = "";
  server.stdout?.on("data", (d) => { log += d; });
  server.stderr?.on("data", (d) => { log += d; });
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    if (await serverUp()) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("servidor Next não subiu:\n" + log.slice(-3000));
}

const item = (i: number, over: Partial<typeof schema.campaignItems.$inferInsert> = {}) => ({
  id: `itm_gen${uid}${String(i).padStart(2, "0")}`, orgId: ORG, campaignId: CMP, productId: null,
  name: ["Arroz Tipo 1", "Feijão Carioca", "Banana Prata", "Leite Integral", "Café Torrado", "Açúcar Refinado", "Óleo de Soja", "Macarrão Espaguete", "Tomate", "Frango Inteiro", "Detergente", "Sabão em Pó", "Refrigerante", "Biscoito"][i % 14],
  brand: null, sizeLabel: i % 2 ? "1kg" : "5kg", unit: "kg", category: ["Mercearia", "Hortifruti", "Açougue"][i % 3],
  imageAssetId: null, imageFit: { x: 50, y: 50, zoom: 1 },
  offer: { ...emptyOffer(), priceCents: i === 0 ? 499 : 199 + i * 37 }, highlight: i === 0, position: i, paused: i === 5,
  ...over,
});

beforeAll(async () => {
  if (!template) throw new Error("nenhum modelo no registro (src/templates/registry.ts)");
  await db.insert(schema.plans).values({ id: "inicial", name: "Inicial", limits: { stores: 1, users: 2, storageMb: 1024, exportsPerMonth: 200, videoMinutesPerMonth: 0, aiCreditsPerMonth: 0, features: [] } }).onConflictDoNothing();
  await db.insert(schema.users).values({ id: USER, email: `gen${uid}@exemplo.com`, name: "Teste Geração", passwordHash: "x" });
  await db.insert(schema.organizations).values([{ id: ORG, name: "Mercado Teste", planId: "inicial" }, { id: OTHER_ORG, name: "Outra Conta", planId: "inicial" }]);
  await db.insert(schema.brandKits).values({ id: KIT, orgId: ORG, name: "Padrão", colors: { primary: "#c81e1e", secondary: "#ffd23f", accent: "#1f7a3a", text: "#1b1b1b", background: "#fff6dc" }, legalText: "Imagens ilustrativas." });
  await db.insert(schema.stores).values({
    id: STORE, orgId: ORG, brandKitId: KIT, name: "Mercado Teste", slug: `mercado-teste-${uid}`, phone: "1133334444", whatsapp: "5511999990000",
    address: { street: "Rua das Flores", number: "120", district: "Centro", city: "Campinas", state: "SP" },
    hours: { "1": "07:00-21:00", "2": "07:00-21:00", "3": "07:00-21:00", "4": "07:00-21:00", "5": "07:00-21:00", "6": "07:00-21:00", "0": "07:00-13:00" },
  });
  // imagem real no armazenamento (servida por /api/assets/:id?t=..., rota do Backend)
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#f4a300" } }).png().toBuffer();
  const imgId = `ast_gen${uid}`;
  await storage.put(`${ORG}/images/${imgId}.png`, png, "image/png");
  await db.insert(schema.assets).values({ id: imgId, orgId: ORG, kind: "image", storageKey: `${ORG}/images/${imgId}.png`, mime: "image/png", bytes: png.length, width: 400, height: 400, source: "upload_lojista" });

  const common = { orgId: ORG, storeId: STORE, templateId: template.id, templateVersion: template.version, createdBy: USER,
    startsAt: new Date("2026-10-10T12:00:00Z"), endsAt: new Date("2026-10-13T12:00:00Z"), validityNote: "ou enquanto durarem os estoques" };
  await db.insert(schema.campaigns).values([
    { ...common, id: CMP, name: "Ofertas da Semana Outubro", title: "Ofertas da Semana", version: 2 },
    { ...common, id: BAD, name: "Campanha com erro", version: 1 },
  ]);
  const items = Array.from({ length: 14 }, (_, i) => item(i, i === 2 ? { imageAssetId: imgId } : {}));
  await db.insert(schema.campaignItems).values(items);
  await db.insert(schema.campaignItems).values(item(0, { id: `itm_bad${uid}`, campaignId: BAD, offer: { ...emptyOffer(), priceCents: null } }));
  await db.insert(schema.campaignPieces).values([
    { orgId: ORG, campaignId: CMP, format: "encarte_a4", enabled: true, overrides: {} },
    { orgId: ORG, campaignId: CMP, format: "story", enabled: true, overrides: {} },
    { orgId: ORG, campaignId: CMP, format: "etiqueta_a4", enabled: true, overrides: {} },
    { orgId: ORG, campaignId: CMP, format: "post_quadrado", enabled: false, overrides: {} },
  ]);
  // versão 1 (instantâneo antigo): Arroz custava R$ 5,49
  const snapItems = items.map((it) => ({ ...it, offer: it.position === 0 ? { ...it.offer, priceCents: 549 } : it.offer }));
  await db.insert(schema.campaignVersions).values({ orgId: ORG, campaignId: CMP, version: 1, contentHash: "h1", reason: "teste",
    snapshot: { campaign: { name: "Ofertas da Semana Outubro", title: "Ofertas da Semana", templateId: template.id, templateVersion: template.version, startsAt: common.startsAt, endsAt: common.endsAt, validityNote: common.validityNote, overrides: {} }, items: snapItems, pieces: [{ format: "story", enabled: true, overrides: {} }] } });
  await startServer();
}, 300_000);

afterAll(async () => {
  await closeBrowser();
  await stopBoss();
  for (const id of [ORG, OTHER_ORG]) await db.delete(schema.organizations).where(eq(schema.organizations.id, id));
  await db.delete(schema.users).where(eq(schema.users.id, USER));
  await getPool().end();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* já encerrado */ } }
});

async function newJob(request: { kind: "single" | "package"; items: Array<{ format: string; fileType: "png" | "jpeg" | "pdf" }>; bleed?: boolean }, version = 2) {
  const id = `exp_gen${uid}${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(schema.exportJobs).values({ id, orgId: ORG, campaignId: CMP, campaignVersion: version, request, createdBy: USER });
  return id;
}
async function jobRow(id: string) {
  const [j] = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, id));
  return j!;
}
async function resultFile(id: string) {
  const j = await jobRow(id);
  expect(j.status, j.error ?? "").toBe("concluida");
  const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, j.resultAssetId!));
  expect(a.kind).toBe("export");
  expect(a.source).toBe("gerado_sistema");
  expect(a.storageKey.startsWith(`${ORG}/exports/${id}.`)).toBe(true);
  return { job: j, asset: a, data: await storage.get(a.storageKey) };
}
const pagesOf = async (format: keyof typeof FORMATS) => {
  const b = await loadRenderBundle({ orgId: ORG }, CMP, { version: 2, signedUrlTtlSec: 60 });
  const ov = effectiveOverrides(b, format);
  return layoutPiece({ campaign: { ...b.campaign, title: ov.title || b.campaign.title }, format: FORMATS[format], template, overrides: ov }).pages.length;
};

describe("dados de renderização", () => {
  it("monta textos prontos em português e nunca expõe custo", async () => {
    const b = await loadRenderBundle({ orgId: ORG }, CMP, { version: "current", signedUrlTtlSec: 60 });
    expect(b.campaign.validityText).toBe("Ofertas válidas de 10/10 a 13/10/2026 ou enquanto durarem os estoques");
    expect(b.campaign.brand.address).toBe("Rua das Flores, 120 - Centro, Campinas/SP");
    expect(b.campaign.brand.hours).toBe("Seg a Sáb 7h–21h · Dom 7h–13h");
    expect(b.campaign.brand.whatsapp).toBe("(11) 99999-0000");
    expect(b.campaign.items.length).toBe(14); // pausado continua no impresso
    expect(b.pausedItemIds.length).toBe(1);
    expect(b.campaign.items[2].imageUrl).toMatch(/^\/api\/assets\/ast_gen\w+\?t=/);
    expect(JSON.stringify(b.campaign)).not.toMatch(/cost/i);
    expect(buildValidityText(new Date("2026-12-30T12:00:00Z"), new Date("2027-01-02T12:00:00Z"))).toBe("Ofertas válidas de 30/12/2026 a 02/01/2027");
    expect(formatHoursLine({ "1": "08:00-18:00", "2": "08:00-18:00" })).toBe("Seg e Ter 8h–18h");
  });

  it("usa o instantâneo da versão pedida", async () => {
    const v1 = await loadRenderBundle({ orgId: ORG }, CMP, { version: 1, signedUrlTtlSec: 60 });
    expect(v1.source).toBe("snapshot");
    expect(v1.campaign.items[0].offer.priceCents).toBe(549);
    const v2 = await loadRenderBundle({ orgId: ORG }, CMP, { version: 2, signedUrlTtlSec: 60 });
    expect(v2.source).toBe("live");
    expect(v2.campaign.items[0].offer.priceCents).toBe(499);
  });

  it("isola por conta", async () => {
    await expect(loadRenderBundle({ orgId: OTHER_ORG }, CMP, { signedUrlTtlSec: 60 })).rejects.toThrow(/não encontrad/);
  });
});

describe("página de renderização", () => {
  it("rejeita token inválido e de outra campanha", async () => {
    const r = await fetch(`${BASE}/render/${CMP}?f=story&p=0&t=abc`);
    expect(await r.text()).toContain("inválido ou expirado");
    const t = signRenderToken({ cid: BAD, org: ORG, v: 1 });
    const r2 = await fetch(`${BASE}${renderPath({ campaignId: CMP, format: "story", page: 0, version: 1, token: t })}`);
    expect(await r2.text()).toContain("inválido ou expirado");
  });

  it("mostra o preço armazenado (R$ 4,99) e o da versão antiga (R$ 5,49)", async () => {
    for (const [v, price] of [[2, "4,99"], [1, "5,49"]] as const) {
      const token = signRenderToken({ cid: CMP, org: ORG, v });
      const url = BASE + renderPath({ campaignId: CMP, format: "story", page: 0, version: v, token });
      const text = await withPage({ width: 1080, height: 1920, scale: 1 }, async (page) => {
        await page.goto(url);
        await page.waitForFunction(() => (window as unknown as { __EV_READY?: boolean }).__EV_READY === true, null, { timeout: 120_000 });
        expect(await page.getAttribute("[data-ev-render]", "data-ev-version")).toBe(String(v));
        return page.locator("[data-ev-page]").first().innerText();
      });
      const flat = text.replace(/\s+/g, "");
      expect(flat).toContain("R$");
      expect(flat).toContain(price);
    }
  });
});

describe("exportação", () => {
  it("encarte A4 em PDF: tamanho A4 e páginas = layout", async () => {
    const id = await newJob({ kind: "single", items: [{ format: "encarte_a4", fileType: "pdf" }] });
    expect(await runExportJob(id, { finalAttempt: true })).toBe("concluida");
    const { data, job, asset } = await resultFile(id);
    const info = inspectPdf(data);
    expect(info.pages).toBe(await pagesOf("encarte_a4"));
    expect(Math.abs(info.widthMm - 210)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(info.heightMm - 297)).toBeLessThanOrEqual(0.5);
    expect(job.resultInfo![0]).toMatchObject({ fileType: "pdf", pages: info.pages });
    expect(job.attempts).toBe(1);
    expect(asset.originalName).toBe("ofertas-da-semana-outubro_encarte-a4.pdf");
    writeFileSync(path.join(OUT, "encarte.pdf"), data);
  });

  it("encarte A4 em PNG: 300 dpi (2481×3508), um arquivo por página", async () => {
    const id = await newJob({ kind: "single", items: [{ format: "encarte_a4", fileType: "png" }] });
    expect(await runExportJob(id, { finalAttempt: true })).toBe("concluida");
    const { data, job } = await resultFile(id);
    const pages = await pagesOf("encarte_a4");
    const fmt = FORMATS.encarte_a4;
    const w = Math.round(fmt.widthPx * fmt.exportScale), h = Math.round(fmt.heightPx * fmt.exportScale);
    let first: Buffer;
    if (pages === 1) first = data;
    else {
      const zip = await JSZip.loadAsync(data);
      const pngs = Object.keys(zip.files).filter((f) => f.endsWith(".png")).sort();
      expect(pngs.length).toBe(pages);
      expect(pngs[0]).toBe("01-encarte/ofertas-da-semana-outubro_encarte-a4_pagina-01.png");
      first = await zip.file(pngs[0])!.async("nodebuffer");
    }
    const m = await sharp(first).metadata();
    expect([m.width, m.height]).toEqual([w, h]);
    expect(m.density).toBe(300);
    expect(job.resultInfo!.every((r) => r.dpi === 300 && r.widthPx === w)).toBe(true);
    writeFileSync(path.join(OUT, "encarte-p1.png"), first);
  });

  it("story em PNG: 1080×1920", async () => {
    const id = await newJob({ kind: "single", items: [{ format: "story", fileType: "png" }] });
    expect(await runExportJob(id, { finalAttempt: true })).toBe("concluida");
    const { data, job } = await resultFile(id);
    const pages = await pagesOf("story");
    const first = pages === 1 ? data : await (await JSZip.loadAsync(data)).file(/story_pagina-01\.png$/)[0].async("nodebuffer");
    const m = await sharp(first).metadata();
    expect([m.width, m.height]).toEqual([1080, 1920]);
    expect(job.resultInfo!.length).toBe(pages);
    writeFileSync(path.join(OUT, "story-p1.png"), first);
  });

  it("pacote ZIP: pastas por formato, LEIA-ME e sangria", async () => {
    const id = await newJob({ kind: "package", items: [], bleed: true });
    expect(await runExportJob(id, { finalAttempt: true })).toBe("concluida");
    const { data, job } = await resultFile(id);
    const zip = await JSZip.loadAsync(data);
    const names = Object.keys(zip.files);
    expect(names).toContain("LEIA-ME.txt");
    expect(names.some((n) => n.startsWith("01-encarte/") && n.endsWith("_com-sangria.pdf"))).toBe(true);
    expect(names.some((n) => n.startsWith("02-redes-sociais/") && n.endsWith(".png"))).toBe(true);
    expect(names.some((n) => n.startsWith("04-etiquetas/") && n.endsWith(".pdf"))).toBe(true);
    expect(names.some((n) => n.includes("post-quadrado"))).toBe(false); // peça desativada
    const readme = await zip.file("LEIA-ME.txt")!.async("string");
    expect(readme).toContain("Arquivos em RGB. Não há conversão CMYK; confirme com sua gráfica.");
    expect(readme).toContain("Versão da campanha: 2");
    const bleedPdf = inspectPdf(await zip.file(/_com-sangria\.pdf$/)[0].async("nodebuffer"));
    expect(Math.abs(bleedPdf.widthMm - 216)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bleedPdf.heightMm - 303)).toBeLessThanOrEqual(0.5);
    const tags = inspectPdf(await zip.file(/etiqueta-a4\.pdf$/)[0].async("nodebuffer"));
    expect(tags.pages).toBe(2); // 14 itens / 8 por folha
    expect(job.resultInfo!.length).toBeGreaterThanOrEqual(3);
    writeFileSync(path.join(OUT, "pacote.zip"), data);
    writeFileSync(path.join(OUT, "etiquetas.pdf"), await zip.file(/etiqueta-a4\.pdf$/)[0].async("nodebuffer"));
  });

  it("versão antiga é exportada exatamente como estava (R$ 5,49)", async () => {
    const id = await newJob({ kind: "single", items: [{ format: "story", fileType: "jpeg" }] }, 1);
    expect(await runExportJob(id, { finalAttempt: true })).toBe("concluida");
    const { job } = await resultFile(id);
    expect(job.campaignVersion).toBe(1);
    expect(job.resultInfo![0].fileType).toBe("jpeg");
  });

  it("API de serviço: valida tipo de arquivo, bloqueia erros de oferta e isola contas", async () => {
    process.env.EXPORT_INLINE = "1";
    const ctx = { userId: USER, orgId: ORG, role: "admin" as const, storeIds: null, isPlatformAdmin: false };
    await expect(createExportJob(ctx, CMP, { kind: "single", items: [{ format: "story", fileType: "pdf" }] })).rejects.toThrow(/não pode ser exportado como PDF/);
    await expect(createExportJob(ctx, BAD, { kind: "single", items: [{ format: "story", fileType: "png" }] })).rejects.toThrow(/Informe o preço da oferta/);
    const dto = await createExportJob(ctx, CMP, { kind: "single", items: [{ format: "post_quadrado", fileType: "jpeg" }] });
    expect(dto.status).toBe("concluida");
    expect(dto.campaignVersion).toBe(2);
    expect(dto.downloadUrl).toBe(`/api/exports/${dto.id}/download`);
    expect((await listExportJobs(ctx, CMP)).some((j) => j.id === dto.id)).toBe(true);
    await expect(getExportJob({ orgId: OTHER_ORG }, dto.id)).rejects.toThrow(/não encontrad/);
    expect(await listExportJobs({ orgId: OTHER_ORG }, CMP)).toEqual([]);
    delete process.env.EXPORT_INLINE;
  });

  it("falha com mensagem amigável quando a versão não existe", async () => {
    const id = await newJob({ kind: "single", items: [{ format: "story", fileType: "png" }] }, 99);
    expect(await runExportJob(id, { finalAttempt: true })).toBe("falhou");
    const j = await jobRow(id);
    expect(j.status).toBe("falhou");
    expect(j.error).toMatch(/versão 99/);
    await expect(generateExport({ ...j, request: j.request })).rejects.toThrow();
  });

  it("varredura: job travado em 'processando' é reenfileirado ou marcado como falhou", async () => {
    const old = new Date(Date.now() - 20 * 60_000);
    const a = await newJob({ kind: "single", items: [{ format: "story", fileType: "png" }] });
    const b = await newJob({ kind: "single", items: [{ format: "story", fileType: "png" }] });
    await db.update(schema.exportJobs).set({ status: "processando", startedAt: old, attempts: 1 }).where(eq(schema.exportJobs.id, a));
    await db.update(schema.exportJobs).set({ status: "processando", startedAt: old, attempts: 3 }).where(eq(schema.exportJobs.id, b));
    const r = await sweepStuckExports();
    expect(r.requeued).toContain(a);
    expect(r.failed).toContain(b);
    expect((await jobRow(a)).status).toBe("na_fila");
    const jb = await jobRow(b);
    expect(jb.status).toBe("falhou");
    expect(jb.error).toMatch(/demorou demais/);
  });
});
