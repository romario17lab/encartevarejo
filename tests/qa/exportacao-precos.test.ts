// Critérios 2 (preços corretos em todos os materiais), 6 (PNG/PDF abrem e batem com a prévia/render)
// e 7 (pacote pela fila real do worker: estados e download).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright-core";
import JSZip from "jszip";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { FORMATS, FORMAT_IDS, type FormatId } from "@/domain/formats";
import { describeOffer, type Offer, type Unit } from "@/domain/offer";
import { formatBRL } from "@/domain/money";
import { EVIDENCE, signup, sql, waitExport, type Account } from "./helpers";
import { buildCampaign } from "./fixtures";
import { inspect, launch } from "./render-inspect";
import { montage } from "./montage";

const DIR = `${EVIDENCE}/exportacao`;
mkdirSync(DIR, { recursive: true });
let browser: Browser, A: Account, cid: string, version: number;
let stored: Map<string, { name: string; unit: Unit | null; offer: Offer }>;
const log: string[] = [];

/** valor principal exibido no preço (reais + centavos) conforme a mecânica */
const mainCents = (o: Offer) => (o.mode === "combo" ? o.comboCents : o.mode === "club" ? o.clubCents : o.priceCents)!;
const mainText = (o: Offer) => formatBRL(mainCents(o)).replace(/\s+/g, ""); // "R$59,90"

interface PdfWord { page: number; x0: number; y0: number; x1: number; y1: number; t: string }
/** Palavras do PDF com a caixa de cada uma (pdftotext -bbox). */
function pdfWords(file: string): PdfWord[] {
  const html = execFileSync("pdftotext", ["-bbox", file, "-"]).toString();
  const out: PdfWord[] = [];
  let page = 0;
  for (const m of html.matchAll(/<page |<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
    if (m[0].startsWith("<page")) { page++; continue; }
    out.push({ page, x0: +m[1]!, y0: +m[2]!, x1: +m[3]!, y1: +m[4]!, t: m[5]!.replace(/&amp;/g, "&") });
  }
  return out;
}
/** "reais,cc" inteiro, ou "reais" seguido imediatamente (à direita, mesma faixa vertical) de ",cc". */
function pdfHasPrice(words: PdfWord[], reais: string, cc: string): boolean {
  if (words.some((w) => w.t.replace(/^R\$/, "") === `${reais},${cc}`)) return true;
  return words.some((a) => a.t === reais && words.some((b) =>
    b.page === a.page && b.t === `,${cc}` && b.x0 >= a.x1 - 2 && b.x0 - a.x1 < a.y1 - a.y0 && b.y0 < a.y1 && b.y1 > a.y0));
}

beforeAll(async () => {
  browser = await launch();
  A = await signup("Export");
  const c = await buildCampaign(A, 12, { name: "Pacote QA" });
  cid = c.id; version = c.state.campaign.version;
  const rows = await sql("select id, name, unit, offer from campaign_items where campaign_id=$1", [cid]);
  stored = new Map(rows.map((r: any) => [r.id, { name: r.name, unit: r.unit, offer: r.offer }]));
});
afterAll(async () => { await browser?.close(); writeFileSync(`${DIR}/relatorio.txt`, log.join("\n")); });

describe("exportação e preços", () => {
  it("2: render-data devolve exatamente os preços gravados (sem custo)", async () => {
    const rd = (await A.api.get(`/api/campaigns/${cid}/render-data`)).json;
    expect(rd.items).toHaveLength(12);
    for (const it of rd.items) expect(it.offer).toEqual(stored.get(it.id)!.offer);
  });

  it("2: em cada um dos 9 formatos, cada preço exibido = preço gravado", async () => {
    for (const f of FORMAT_IDS) {
      const r = await inspect(browser, cid, A.orgId, version, f);
      let n = 0;
      for (const cell of r.cells) {
        const s = stored.get(cell.id)!;
        expect(cell.aria, `${f} ${s.name}`).toBe(describeOffer(s.offer, s.unit));
        expect(cell.priceText, `${f} ${s.name}`).toContain(mainText(s.offer).replace("R$", ""));
        if (s.offer.mode === "from_to") expect(cell.priceText).toContain(formatBRL(s.offer.regularCents!).replace(/\s+/g, ""));
        n++;
      }
      log.push(`${f}: ${n} preços conferidos`);
      expect(n).toBeGreaterThan(0);
    }
  });

  it("7: pacote completo pela fila do worker (na_fila → processando → concluida) e download do ZIP", async () => {
    const r = await A.api.post(`/api/campaigns/${cid}/exports`, { kind: "package" });
    expect(r.status).toBe(201);
    expect(r.json.status).toBe("na_fila");
    expect(r.json.campaignVersion).toBe(version);
    const { job, seen } = await waitExport(A, r.json.id);
    log.push(`estados observados: ${seen.join(" → ")}`);
    expect(job.status, job.error).toBe("concluida");
    expect(seen).toContain("processando");
    const list = (await A.api.get(`/api/exports?campaignId=${cid}`)).json.exports;
    expect(list[0].id).toBe(job.id);
    const dl = await A.api.get(job.downloadUrl);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/zip");
    expect(dl.headers.get("content-disposition")).toMatch(/attachment/);
    writeFileSync(`${DIR}/pacote.zip`, dl.buf);
    const zip = await JSZip.loadAsync(dl.buf);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    log.push("ZIP:\n  " + names.join("\n  "));
    expect(names).toContain("LEIA-ME.txt");
    const readme = await zip.file("LEIA-ME.txt")!.async("string");
    expect(readme).toContain(`Versão da campanha: ${version}`);
    const tiles: Array<{ buf: Buffer; label: string }> = [];
    for (const f of FORMAT_IDS) {
      const spec = FORMATS[f];
      const files = names.filter((n) => n.startsWith(spec.folder + "/") && n.includes(f.replace(/_/g, "-")));
      expect(files.length, f).toBeGreaterThan(0);
      for (const n of files) {
        const buf = await zip.file(n)!.async("nodebuffer");
        const local = `${DIR}/${n.replace(/\//g, "__")}`;
        writeFileSync(local, buf);
        if (n.endsWith(".pdf")) {
          const info = execFileSync("pdfinfo", [local]).toString();
          const pages = Number(/Pages:\s+(\d+)/.exec(info)![1]);
          const [, w, h] = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info)!;
          const mm = (pt: string) => (Number(pt) * 25.4) / 72;
          expect(Math.abs(mm(w!) - spec.physical!.widthMm), n).toBeLessThan(1);
          expect(Math.abs(mm(h!) - spec.physical!.heightMm), n).toBeLessThan(1);
          const r = await inspect(browser, cid, A.orgId, version, f);
          expect(pages, n).toBe(r.pages);
          // texto do PDF contém todos os preços dos itens daquela peça. Os modelos usam posicionamento
          // absoluto e reais/centavos em tamanhos diferentes, então o fluxo de texto do pdftotext pode juntar
          // os reais a palavras vizinhas (ex.: "2 TA"). Por isso usamos as caixas das palavras (-bbox):
          // o preço conta como presente quando aparece inteiro ("2,29") ou quando os reais ("2") estão
          // imediatamente à esquerda dos centavos (",29") na mesma faixa vertical da mesma página.
          const words = pdfWords(local);
          for (const cell of r.cells) {
            const [reais, cc] = mainText(stored.get(cell.id)!.offer).replace("R$", "").split(",");
            expect(pdfHasPrice(words, reais!, cc!), `${n} ${stored.get(cell.id)!.name}: ${reais},${cc}`).toBe(true);
          }
          log.push(`${n}: ${pages} página(s), ${mm(w!).toFixed(1)}×${mm(h!).toFixed(1)} mm, ${r.cells.length} preços no texto do PDF`);
          execFileSync("pdftoppm", ["-png", "-r", "60", "-f", "1", "-l", "1", local, local.replace(/\.pdf$/, "_raster")]);
          const raster = execFileSync("bash", ["-c", `ls ${local.replace(/\.pdf$/, "_raster")}*.png`]).toString().trim().split("\n")[0]!;
          tiles.push({ buf: await sharp(raster).png().toBuffer(), label: `${f} PDF` });
        } else {
          const meta = await sharp(buf).metadata();
          expect(meta.width, n).toBe(Math.round(spec.widthPx * spec.exportScale));
          expect(meta.height, n).toBe(Math.round(spec.heightPx * spec.exportScale));
          if (n.endsWith("pagina-01.png")) tiles.push({ buf, label: `${f} PNG` });
          log.push(`${n}: ${meta.width}×${meta.height}`);
        }
      }
    }
    await montage(tiles, `${DIR}/00-pacote.png`, { h: 520, perRow: 5 });
  });

  it("6: PNG exportado = página de prévia/render (diferença de pixels)", async () => {
    const r = await A.api.post(`/api/campaigns/${cid}/exports`, { kind: "single", items: [{ format: "post_quadrado", fileType: "png" }] });
    const { job } = await waitExport(A, r.json.id);
    expect(job.status).toBe("concluida");
    const dlBuf = (await A.api.get(job.downloadUrl)).buf;
    const z = await JSZip.loadAsync(dlBuf); // 12 produtos = 3 páginas → ZIP
    const png = await z.file(Object.keys(z.files).find((k) => k.endsWith("pagina-01.png"))!)!.async("nodebuffer");
    const prev = await inspect(browser, cid, A.orgId, version, "post_quadrado", { shots: 1 });
    const a = await sharp(png).resize(1080, 1080).removeAlpha().raw().toBuffer();
    const b = await sharp(prev.screenshots[0]!).resize(1080, 1080).removeAlpha().raw().toBuffer();
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 16) diff++;
    const pct = (diff / a.length) * 100;
    log.push(`post_quadrado: PNG exportado × render: ${pct.toFixed(3)}% de canais diferentes`);
    writeFileSync(`${DIR}/comparacao_exportado.png`, png);
    writeFileSync(`${DIR}/comparacao_render.png`, prev.screenshots[0]!);
    expect(pct).toBeLessThan(0.5);
    // PDF: rasteriza a 1ª página do cartaz A4 (pdftoppm, 96 dpi) e compara com a página de render
    const pdfPath = `${DIR}/03-cartazes__pacote-qa_cartaz-a4.pdf`;
    execFileSync("pdftoppm", ["-png", "-r", "96", "-f", "1", "-l", "1", "-singlefile", pdfPath, `${DIR}/comparacao_pdf_cartaz`]);
    const rc = await inspect(browser, cid, A.orgId, version, "cartaz_a4", { shots: 1 });
    const W = 794, H = 1123;
    const pa = await sharp(`${DIR}/comparacao_pdf_cartaz.png`).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const pb = await sharp(rc.screenshots[0]!).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < pa.length; i++) sum += Math.abs(pa[i]! - pb[i]!);
    const mae = sum / pa.length;
    log.push(`cartaz_a4: PDF rasterizado × render: erro médio ${mae.toFixed(2)} por canal (0–255)`);
    writeFileSync(`${DIR}/comparacao_render_cartaz.png`, rc.screenshots[0]!);
    expect(mae).toBeLessThan(10);
  });

  it("2: mudança de preço depois da exportação não altera o arquivo antigo; novo pedido usa a nova versão", async () => {
    const st = (await A.api.get(`/api/campaigns/${cid}`)).json;
    const items = st.items.map((i: any, k: number) => (k === 1 ? { ...i, offer: { ...i.offer, priceCents: 459 } } : i));
    const sv = await A.api.put(`/api/campaigns/${cid}`, { baseVersion: st.campaign.version, items });
    const r = await A.api.post(`/api/campaigns/${cid}/exports`, { kind: "single", items: [{ format: "cartaz_a4", fileType: "pdf" }] });
    expect(r.json.campaignVersion).toBe(sv.json.campaign.version);
    const { job } = await waitExport(A, r.json.id);
    const pdf = (await A.api.get(job.downloadUrl)).buf;
    writeFileSync(`${DIR}/cartaz-novo-preco.pdf`, pdf);
    const text = execFileSync("pdftotext", [`${DIR}/cartaz-novo-preco.pdf`, "-"]).toString().replace(/\s+/g, "");
    expect(text).toContain("4,59");
    expect(text).not.toContain("4,99");
  });
});
