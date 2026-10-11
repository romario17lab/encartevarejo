// Pipeline de exportação: abre /render/:id no Chromium, gera PNG/JPEG/PDF, verifica os arquivos,
// empacota (ZIP com LEIA-ME) e grava o resultado. Usado pelo worker (pg-boss) e, em
// desenvolvimento/testes, em processo (EXPORT_INLINE=1) — o mesmo código nos dois casos.
import { and, eq } from "drizzle-orm";
import JSZip from "jszip";
import sharp from "sharp";
import { getDb, schema } from "@/server/db";
import { newId } from "@/server/ids";
import { sha256 } from "@/server/signing";
import { storage } from "@/server/storage";
import { slugify } from "@/server/text";
import { FORMATS, type FormatId, type FormatSpec } from "@/domain/formats";
import { getTemplate } from "@/templates/registry";
import type { TemplateDefinition } from "@/templates/contract";
import { layoutPiece } from "@/layout/engine";
import { applyTextOverrides } from "@/render/PieceRenderer";
import { offersFingerprint } from "@/render/fingerprint";
import { effectiveOverrides, loadRenderBundle, type RenderBundle } from "@/server/services/render-data";
import { renderPath, signRenderToken } from "./render-token";
import { withPage } from "./browser";
import { inspectPdf, inspectRaster } from "./verify";

export type FileType = "png" | "jpeg" | "pdf";
export interface ExportRequest { kind: "single" | "package"; items: Array<{ format: string; fileType: FileType }>; bleed?: boolean }
type ResultInfo = NonNullable<typeof schema.exportJobs.$inferSelect["resultInfo"]>[number];

/** Falha com mensagem amigável (pt-BR). `retryable` = vale tentar de novo (instabilidade). */
export class ExportFailure extends Error {
  constructor(public readonly userMessage: string, public readonly retryable: boolean, technical?: string) {
    super(technical ?? userMessage);
  }
}

const MIME: Record<FileType, string> = { png: "image/png", jpeg: "image/jpeg", pdf: "application/pdf" };
const EXT: Record<FileType, string> = { png: "png", jpeg: "jpg", pdf: "pdf" };
const MM_PX = 96 / 25.4;
const RENDER_TIMEOUT = Number(process.env.EXPORT_RENDER_TIMEOUT_MS ?? 90_000);

export function renderBaseUrl(): string {
  return (process.env.RENDER_BASE_URL || process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

const formatSlug = (f: FormatSpec) => f.id.replace(/_/g, "-");
const pad2 = (n: number) => String(n).padStart(2, "0");
const dpiOf = (f: FormatSpec) => (f.physical ? Math.round(96 * f.exportScale) : undefined);

interface GeneratedFile { zipPath: string; fileName: string; data: Buffer; mime: string; info: ResultInfo }

interface PieceContext {
  bundle: RenderBundle;
  template: TemplateDefinition;
  slug: string;
  expectedOffers: string;
}

/** Abre a página de renderização e confere versão, preços e número de páginas. */
async function openRender(page: import("playwright-core").Page, ctx: PieceContext, format: FormatSpec, bleed: boolean, expectedPages: number) {
  const token = signRenderToken({ cid: ctx.bundle.campaignId, org: ctx.bundle.orgId, v: ctx.bundle.version }, 900);
  const url = renderBaseUrl() + renderPath({ campaignId: ctx.bundle.campaignId, format: format.id, page: "all", version: ctx.bundle.version, token, bleed });
  let resp;
  try {
    resp = await page.goto(url, { waitUntil: "load", timeout: RENDER_TIMEOUT });
  } catch (e) {
    throw new ExportFailure("Não foi possível abrir a peça para gerar o arquivo. Tente novamente em alguns minutos.", true, `goto ${format.id}: ${(e as Error).message}`);
  }
  if (!resp || resp.status() >= 400) throw new ExportFailure("O servidor de renderização não respondeu. Tente novamente em alguns minutos.", true, `HTTP ${resp?.status()} em ${format.id}`);
  try {
    await page.waitForFunction(() => (window as unknown as { __EV_READY?: boolean }).__EV_READY === true, null, { timeout: RENDER_TIMEOUT });
  } catch {
    throw new ExportFailure("A peça demorou demais para carregar (imagens ou fontes). Tente novamente.", true, `timeout __EV_READY ${format.id}`);
  }
  const state = await page.evaluate(() => {
    const err = document.querySelector("[data-ev-render-error]");
    const root = document.querySelector<HTMLElement>("[data-ev-render]");
    return {
      error: err ? err.getAttribute("data-ev-render-error") || err.textContent || "erro" : null,
      version: root?.dataset.evVersion ?? null,
      offers: root?.dataset.evOffers ?? null,
      pages: root ? Number(root.dataset.evPages) : 0,
      rendered: document.querySelectorAll("[data-ev-page]").length,
      imgErrors: (window as unknown as { __EV_IMG_ERRORS?: string[] }).__EV_IMG_ERRORS ?? [],
    };
  });
  if (state.error) throw new ExportFailure(`Não foi possível gerar ${format.label}: ${state.error}`, false, `render error ${format.id}: ${state.error}`);
  // Guarda de consistência de preços: toda peça precisa ter usado a MESMA versão e os MESMOS preços.
  if (state.version !== String(ctx.bundle.version) || state.offers !== ctx.expectedOffers)
    throw new ExportFailure("Os preços da campanha mudaram durante a exportação. Gere os arquivos novamente.", false,
      `fingerprint mismatch ${format.id}: v=${state.version}/${ctx.bundle.version} offers=${state.offers}/${ctx.expectedOffers}`);
  if (state.pages !== expectedPages || state.rendered !== expectedPages)
    throw new ExportFailure("A quantidade de páginas da peça não confere. Gere os arquivos novamente.", false, `pages ${format.id}: dom=${state.pages}/${state.rendered} esperado=${expectedPages}`);
  return { imageErrors: state.imgErrors.length };
}

async function renderRaster(ctx: PieceContext, format: FormatSpec, fileType: "png" | "jpeg", expectedPages: number): Promise<{ files: GeneratedFile[]; imageErrors: number }> {
  return withPage({ width: format.widthPx, height: format.heightPx, scale: format.exportScale }, async (page) => {
    const { imageErrors } = await openRender(page, ctx, format, false, expectedPages);
    const files: GeneratedFile[] = [];
    const dpi = dpiOf(format);
    const expW = Math.round(format.widthPx * format.exportScale);
    const expH = Math.round(format.heightPx * format.exportScale);
    for (let i = 0; i < expectedPages; i++) {
      const shot = await page.locator(`[data-ev-page="${i}"]`).screenshot({ type: "png", animations: "disabled", timeout: RENDER_TIMEOUT });
      let img = sharp(shot);
      const meta = await img.metadata();
      // arredondamento do Chromium pode variar 1 px: normaliza para o tamanho exato do formato
      if (meta.width !== expW || meta.height !== expH) img = img.resize(expW, expH, { fit: "fill" });
      if (dpi) img = img.withMetadata({ density: dpi });
      const data = fileType === "jpeg"
        ? await img.flatten({ background: "#ffffff" }).jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer()
        : await img.png({ compressionLevel: 6 }).toBuffer();
      const info = await inspectRaster(data);
      if (info.widthPx !== expW || info.heightPx !== expH)
        throw new ExportFailure("Um arquivo gerado saiu com tamanho incorreto. Tente novamente.", true, `raster ${format.id} ${info.widthPx}x${info.heightPx} != ${expW}x${expH}`);
      const fileName = `${ctx.slug}_${formatSlug(format)}_pagina-${pad2(i + 1)}.${EXT[fileType]}`;
      files.push({
        zipPath: `${format.folder}/${fileName}`, fileName, data, mime: MIME[fileType],
        info: { path: `${format.folder}/${fileName}`, format: format.id, fileType, widthPx: info.widthPx, heightPx: info.heightPx, dpi, pages: 1, bytes: data.length },
      });
    }
    return { files, imageErrors };
  });
}

async function renderPdf(ctx: PieceContext, format: FormatSpec, bleed: boolean, expectedPages: number): Promise<{ files: GeneratedFile[]; imageErrors: number }> {
  const useBleed = bleed && !!format.physical && !!format.bleedMm;
  const bleedMm = useBleed ? 3 : 0;
  const bleedPx = bleedMm * MM_PX;
  const contentW = format.widthPx + 2 * bleedPx;
  const contentH = format.heightPx + 2 * bleedPx;
  return withPage({ width: contentW, height: contentH, scale: 1 }, async (page) => {
    const { imageErrors } = await openRender(page, ctx, format, useBleed, expectedPages);
    let pdfOpts: Parameters<typeof page.pdf>[0];
    let expWmm: number, expHmm: number;
    if (format.physical) {
      expWmm = format.physical.widthMm + 2 * bleedMm;
      expHmm = format.physical.heightMm + 2 * bleedMm;
      // o px CSS do formato é arredondado (794 px ≈ 210,08 mm): escala mínima para caber no papel exato
      const scale = Math.min((expWmm * MM_PX) / contentW, (expHmm * MM_PX) / contentH);
      pdfOpts = { width: `${expWmm}mm`, height: `${expHmm}mm`, scale, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" }, preferCSSPageSize: false };
    } else {
      expWmm = Math.round((format.widthPx / MM_PX) * 10) / 10;
      expHmm = Math.round((format.heightPx / MM_PX) * 10) / 10;
      pdfOpts = { width: `${format.widthPx}px`, height: `${format.heightPx}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } };
    }
    await page.emulateMedia({ media: "screen" });
    const data = await page.pdf(pdfOpts);
    const info = inspectPdf(data);
    if (info.pages !== expectedPages || Math.abs(info.widthMm - expWmm) > 1 || Math.abs(info.heightMm - expHmm) > 1)
      throw new ExportFailure("O PDF gerado não confere com o tamanho ou o número de páginas da peça. Tente novamente.", true,
        `pdf ${format.id}: ${info.pages}p ${info.widthMm}x${info.heightMm}mm, esperado ${expectedPages}p ${expWmm}x${expHmm}mm`);
    const fileName = `${ctx.slug}_${formatSlug(format)}${useBleed ? "_com-sangria" : ""}.pdf`;
    return {
      imageErrors,
      files: [{
        zipPath: `${format.folder}/${fileName}`, fileName, data, mime: MIME.pdf,
        info: { path: `${format.folder}/${fileName}`, format: format.id, fileType: "pdf", widthMm: info.widthMm, heightMm: info.heightMm, pages: info.pages, bytes: data.length },
      }],
    };
  });
}

// ------------------------------------------------------------------ LEIA-ME

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const mmTxt = (v: number) => String(v).replace(".", ",");

export function buildReadme(p: { bundle: RenderBundle; template: TemplateDefinition; files: GeneratedFile[]; bleed: boolean; generatedAt: Date }): string {
  const { bundle, template, files } = p;
  const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(p.generatedAt);
  const lines: string[] = [];
  lines.push(`ARQUIVOS DA CAMPANHA: ${bundle.name}`);
  lines.push("");
  if (bundle.campaign.isDemo) { lines.push("ATENÇÃO: DADOS DE DEMONSTRAÇÃO — não use estes arquivos como oferta real."); lines.push(""); }
  lines.push(`Loja: ${bundle.campaign.brand.storeName}`);
  lines.push(`Versão da campanha: ${bundle.version} (todas as peças usam esta mesma versão e os mesmos preços)`);
  if (bundle.campaign.validityText) lines.push(`Validade: ${bundle.campaign.validityText}`);
  lines.push(`Modelo: ${template.name} (versão ${template.version})`);
  lines.push(`Gerado em: ${when}`);
  lines.push("");
  lines.push("ARQUIVOS");
  for (const f of files) {
    const spec = FORMATS[f.info.format as FormatId];
    const t = f.info.fileType === "jpeg" ? "JPEG" : f.info.fileType.toUpperCase();
    const parts = [spec?.label ?? f.info.format, t];
    if (f.info.fileType === "pdf") {
      parts.push(`${f.info.pages} ${f.info.pages === 1 ? "página" : "páginas"}`);
      parts.push(`${mmTxt(f.info.widthMm!)} × ${mmTxt(f.info.heightMm!)} mm`);
      if (f.fileName.includes("_com-sangria")) parts.push("com sangria de 3 mm");
    } else {
      parts.push(`${f.info.widthPx} × ${f.info.heightPx} px`);
      if (f.info.dpi) parts.push(`${f.info.dpi} dpi`);
    }
    parts.push(kb(f.info.bytes));
    lines.push(`- ${f.zipPath}`);
    lines.push(`  ${parts.join(" · ")}`);
  }
  lines.push("");
  lines.push("OBSERVAÇÕES");
  lines.push("- Arquivos em RGB. Não há conversão CMYK; confirme com sua gráfica.");
  if (files.some((f) => f.info.dpi)) lines.push("- Imagens de peças impressas (PNG/JPEG) foram geradas em 300 dpi no tamanho real do papel.");
  if (p.bleed) lines.push("- PDF com sangria: 3 mm em cada lado; as bordas da arte (fundos e faixas) continuam além da linha de corte. Marcas de corte não incluídas; peça à gráfica se precisar.");
  if (files.some((f) => f.info.format === "etiqueta_a4")) lines.push("- Etiquetas: folha A4 com 8 etiquetas de 95 × 65 mm. Imprima em 100% (sem \"ajustar à página\").");
  if (files.some((f) => FORMATS[f.info.format as FormatId]?.physical)) lines.push("- Ao imprimir, use escala 100% (tamanho real).");
  if (files.some((f) => f.info.format === "story")) lines.push("- Story: o topo e a base ficam cobertos pela interface do aplicativo; o conteúdo importante já respeita essa área.");
  lines.push("- Confira preços, validade e condições antes de divulgar.");
  lines.push("");
  return "﻿" + lines.join("\r\n");
}

// ------------------------------------------------------------------ execução de um pedido

export interface ExportOutcome {
  assetId: string;
  storageKey: string;
  fileName: string;
  mime: string;
  bytes: number;
  resultInfo: ResultInfo[];
  warnings: string[];
}

/** Itens padrão do pacote: peças ativas da campanha (impressos em PDF, telas em PNG). */
export function defaultPackageItems(pieces: RenderBundle["pieces"]): ExportRequest["items"] {
  const enabled = pieces.filter((p) => p.enabled).map((p) => p.format);
  const list: FormatId[] = enabled.length ? enabled : ["encarte_a4", "post_quadrado", "story"];
  return list.map((f) => ({ format: f, fileType: FORMATS[f].fileTypes.includes("pdf") ? "pdf" : "png" }));
}

/** Gera os arquivos de um pedido de exportação já registrado em export_jobs. */
export async function generateExport(job: { id: string; orgId: string; campaignId: string; campaignVersion: number; request: ExportRequest; createdBy: string }): Promise<ExportOutcome> {
  const db = getDb();
  let bundle: RenderBundle;
  try {
    bundle = await loadRenderBundle({ orgId: job.orgId }, job.campaignId, { version: job.campaignVersion, signedUrlTtlSec: 1800 });
  } catch (e) {
    throw new ExportFailure((e as Error).message || "Campanha não encontrada.", false, `bundle: ${(e as Error).message}`);
  }
  const errors = bundle.issues.filter((i) => i.level === "error");
  if (errors.length)
    throw new ExportFailure(`Corrija as ofertas antes de exportar: ${errors.slice(0, 5).map((e) => `“${e.name}” — ${e.message}`).join("; ")}${errors.length > 5 ? ` (e mais ${errors.length - 5})` : ""}.`, false, "offer errors");
  const template = getTemplate(bundle.templateId, bundle.templateVersion);
  if (!template) throw new ExportFailure(`O modelo ${bundle.templateId} (versão ${bundle.templateVersion}) não está disponível.`, false, "template missing");

  const items = job.request.items.length ? job.request.items : defaultPackageItems(bundle.pieces);
  const ctx: PieceContext = { bundle, template, slug: slugify(bundle.name || bundle.campaign.title) || "campanha", expectedOffers: offersFingerprint(bundle.campaign.items) };
  const warnings: string[] = [];

  const results = await Promise.all(items.map(async ({ format: fid, fileType }) => {
    const format = FORMATS[fid as FormatId];
    if (!format) throw new ExportFailure(`Formato desconhecido: ${fid}.`, false);
    if (!format.fileTypes.includes(fileType) && !(fileType === "pdf")) throw new ExportFailure(`${format.label} não pode ser exportado como ${fileType.toUpperCase()}.`, false);
    const overrides = effectiveOverrides(bundle, format.id);
    const layout = layoutPiece({ campaign: applyTextOverrides(bundle.campaign, overrides), format, template, overrides });
    if (!layout.pages.some((p) => p.cells.length)) warnings.push(`${format.label}: a peça não tem produtos visíveis.`);
    const out = fileType === "pdf"
      ? await renderPdf(ctx, format, !!job.request.bleed, layout.pages.length)
      : await renderRaster(ctx, format, fileType, layout.pages.length);
    if (out.imageErrors) warnings.push(`${format.label}: ${out.imageErrors} imagem(ns) não carregaram e ficaram de fora.`);
    return out.files;
  }));
  const files = results.flat();
  const generatedAt = new Date();

  let data: Buffer, mime: string, fileName: string, ext: string;
  if (job.request.kind === "single" && files.length === 1) {
    const f = files[0];
    data = f.data; mime = f.mime; fileName = f.fileName; ext = f.fileName.split(".").pop()!;
  } else {
    const zip = new JSZip();
    for (const f of files) zip.file(f.zipPath, f.data, { binary: true, createFolders: true });
    zip.file("LEIA-ME.txt", buildReadme({ bundle, template, files, bleed: !!job.request.bleed && files.some((f) => f.fileName.includes("_com-sangria")), generatedAt }));
    data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" });
    mime = "application/zip"; ext = "zip";
    fileName = `${ctx.slug}_v${bundle.version}_${job.request.kind === "package" ? "pacote" : "arquivos"}.zip`;
  }
  const storageKey = `${job.orgId}/exports/${job.id}.${ext}`;
  await storage.put(storageKey, data, mime);
  const assetId = newId("ast");
  await db.insert(schema.assets).values({
    id: assetId, orgId: job.orgId, kind: "export", storageKey, mime, bytes: data.length, sha256: sha256(data),
    source: "gerado_sistema", sourceNote: `Exportação ${job.id} · campanha versão ${bundle.version}`, originalName: fileName, createdBy: job.createdBy,
  });
  return { assetId, storageKey, fileName, mime, bytes: data.length, resultInfo: files.map((f) => f.info), warnings };
}

// ------------------------------------------------------------------ espelho de status em export_jobs

export const USER_GENERIC_FAILURE = "Não foi possível gerar os arquivos. Tente novamente em alguns minutos.";

/**
 * Executa um job registrado: na_fila → processando → concluida | falhou.
 * `finalAttempt` = sem novas tentativas da fila (então falha vira 'falhou').
 * Lança o erro quando ainda houver tentativas (para a fila tentar de novo).
 */
export async function runExportJob(jobId: string, opts: { finalAttempt?: boolean } = {}): Promise<"concluida" | "falhou" | "ignorada"> {
  const db = getDb();
  const [job] = await db.select().from(schema.exportJobs).where(eq(schema.exportJobs.id, jobId));
  if (!job || job.status === "concluida") return "ignorada";
  await db.update(schema.exportJobs)
    .set({ status: "processando", attempts: job.attempts + 1, startedAt: new Date(), error: null })
    .where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.orgId, job.orgId)));
  const started = Date.now();
  try {
    const out = await generateExport({ ...job, request: job.request as ExportRequest });
    await db.update(schema.exportJobs).set({
      status: "concluida", resultAssetId: out.assetId, resultInfo: out.resultInfo, warnings: out.warnings, finishedAt: new Date(), error: null,
    }).where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.orgId, job.orgId)));
    console.info(`[export] ${job.id} concluída em ${Date.now() - started} ms (${out.resultInfo.length} arquivo(s), ${out.bytes} bytes)`);
    return "concluida";
  } catch (e) {
    const failure = e instanceof ExportFailure ? e : new ExportFailure(USER_GENERIC_FAILURE, true, (e as Error)?.stack ?? String(e));
    console.error(`[export] ${job.id} tentativa ${job.attempts + 1} falhou: ${failure.message}`);
    const willRetry = failure.retryable && !opts.finalAttempt;
    await db.update(schema.exportJobs).set(willRetry
      ? { status: "na_fila", error: "Tentando novamente…" }
      : { status: "falhou", error: failure.userMessage, finishedAt: new Date() },
    ).where(and(eq(schema.exportJobs.id, job.id), eq(schema.exportJobs.orgId, job.orgId)));
    if (willRetry) throw failure;
    return "falhou";
  }
}
