// Verificação de transbordo/sobreposição dos modelos (reutilizável).
// Renderiza cada modelo × formato × cenário no Chromium (mesmo PieceRenderer da exportação) e verifica:
//   1. nenhum [data-ev-price] sai do seu [data-ev-cell];
//   2. nenhum [data-ev-cell] sai da página e nenhuma célula se sobrepõe a outra;
//   3. o conteúdo do preço não é cortado ([data-ev-price-inner] sem rolagem);
//   4. selos de desconto e faixas de destaque ficam dentro da célula;
//   5. título do cabeçalho e rodapé não ficam cortados verticalmente.
// Uso: npx tsx src/templates/__dev__/check-overflow.ts [--only=slug,slug] [--formats=encarte_a4,story]
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import { listTemplates } from "../registry";
import { demoCampaign } from "../demo-data";
import { launch, openHtml, pieceMarkup } from "./render";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const only = args.only ? new Set(args.only.split(",")) : null;
const formats = (args.formats ? args.formats.split(",") : FORMAT_IDS) as FormatId[];

interface Case { name: string; campaign: RenderCampaign; overrides?: PieceOverrides }
const cases = (): Case[] => [
  { name: "1-produto", campaign: demoCampaign(1) },
  { name: "12-produtos", campaign: demoCampaign(12, { withLogo: true }) },
  { name: "40-produtos", campaign: demoCampaign(40, { highlights: 2 }) },
  { name: "nomes-longos", campaign: demoCampaign(12, { longNames: true }) },
  { name: "sem-fotos", campaign: demoCampaign(6, { noImages: true, subtitle: null }) },
  { name: "por-categoria", campaign: demoCampaign(20), overrides: { order: "category", showCategoryHeaders: true } },
  { name: "fonte-130", campaign: demoCampaign(8), overrides: { fontScale: 1.3 } },
];

type Problem = string;

async function main() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.close();
  let checked = 0;
  const problems: Problem[] = [];
  for (const t of listTemplates()) {
    if (only && !only.has(t.id)) continue;
    for (const f of formats) {
      for (const c of cases()) {
        const html = pieceMarkup(t, f, c.campaign, c.overrides ?? {}, "all", 0);
        const p = await openHtml(browser, html, { width: 2000, height: 1200 });
        const found: string[] = await p.evaluate(() => {
          const out: string[] = [];
          const tol = 0.75;
          const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
          document.querySelectorAll<HTMLElement>("[data-ev-root]").forEach((root, pi) => {
            const pr = root.getBoundingClientRect();
            const cells = [...root.querySelectorAll<HTMLElement>("[data-ev-cell]")];
            const rects = cells.map((c) => c.getBoundingClientRect());
            cells.forEach((cell, i) => {
              const id = `p${pi + 1}:${cell.dataset.evCell}`;
              if (!inside(rects[i], pr)) out.push(`${id} célula fora da página`);
              for (let j = i + 1; j < cells.length; j++) {
                const a = rects[i], b = rects[j];
                if (a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol) out.push(`${id} sobrepõe ${cells[j].dataset.evCell}`);
              }
              cell.querySelectorAll<HTMLElement>("[data-ev-price],[data-ev-badge],[data-ev-hero],[data-ev-name]").forEach((el) => {
                if (!inside(el.getBoundingClientRect(), rects[i])) out.push(`${id} ${el.dataset.evPrice !== undefined ? "preço" : el.dataset.evBadge !== undefined ? "selo" : el.dataset.evHero !== undefined ? "faixa destaque" : "nome"} sai da célula`);
              });
              cell.querySelectorAll<HTMLElement>("[data-ev-price-inner]").forEach((el) => {
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`${id} preço cortado (${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight})`);
              });
              // o nome não pode invadir a área do preço
              const name = cell.querySelector<HTMLElement>("[data-ev-name]");
              const price = cell.querySelector<HTMLElement>("[data-ev-price]");
              if (name && price) {
                const a = name.getBoundingClientRect(), b = price.getBoundingClientRect();
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${id} nome sobrepõe preço`);
              }
            });
            root.querySelectorAll<HTMLElement>("[data-ev-title]").forEach((el) => { if (el.scrollHeight > el.clientHeight + parseFloat(el.style.fontSize) * 0.45) out.push(`p${pi + 1} título cortado`); });
          });
          return out;
        });
        checked++;
        for (const x of found) problems.push(`${t.id} · ${f} · ${c.name} · ${x}`);
        await p.close();
      }
    }
    console.log(`${t.id}: ${problems.filter((x) => x.startsWith(t.id + " ")).length} problema(s)`);
  }
  await browser.close();
  console.log(`\n${checked} renderizações verificadas, ${problems.length} problema(s).`);
  for (const p of problems.slice(0, 80)) console.log(" -", p);
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
