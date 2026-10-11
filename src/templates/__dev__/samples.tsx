// Dev: gera as imagens de amostra dos modelos com dados de demonstração.
// Uso: npx tsx src/templates/__dev__/samples.tsx [--only=slug,slug] [--out=dir] [--sheet-only]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { listTemplates } from "../registry";
import { demoCampaign } from "../demo-data";
import type { FormatId } from "@/domain/formats";
import type { PieceOverrides } from "@/domain/campaign";
import type { TemplateDefinition } from "../contract";
import { launch, openHtml, pieceMarkup } from "./render";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const OUT = args.out ?? "/mnt/project-files/encartevarejo/amostras";
const only = args.only ? new Set(args.only.split(",")) : null;
const fileFormat = (f: string) => f.replace(/_/g, "-");

/** Campanha de amostra por segmento (itens coerentes com o modelo). */
function sampleCampaign(t: TemplateDefinition, n: number, extra: Parameters<typeof demoCampaign>[1] = {}) {
  const seg = t.segments[0];
  const cats: Record<string, string[]> = {
    hortifruti: ["Hortifrúti"], acougue: ["Açougue"], padaria: ["Padaria", "Laticínios", "Frios"], bebidas: ["Bebidas"],
    varejo: ["Limpeza", "Mercearia"],
  };
  const titles: Record<string, string> = {
    "natal-em-familia": "Ceia de Natal", "mega-ofertas": "Mega Ofertas", "acougue-na-brasa": "Festival do Churrasco",
    "hortifruti-fresco": "Quarta Verde", "padaria-do-forno": "Fornada de Ofertas", "gelada-na-hora": "Gelada na Hora",
  };
  const c = demoCampaign(n, { categories: cats[seg], title: titles[t.id], withLogo: t.id === "vitrine-clean" || t.id === "emporio-gourmet", ...extra });
  // amostra mostra a paleta própria do modelo (a loja fictícia não impõe cores)
  c.brand.colors = { ...t.palette };
  return c;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const templates = listTemplates().filter((t) => !only || only.has(t.id));
  const browser = await launch();
  const shots: Array<{ t: TemplateDefinition; file: string }> = [];
  const formats: Array<{ f: FormatId; n: number; ov?: PieceOverrides }> = [
    { f: "encarte_a4", n: 12 }, { f: "story", n: 4 }, { f: "post_quadrado", n: 4 }, { f: "cartaz_a4", n: 1 },
  ];
  const all = templates.findIndex(() => true);
  void all;
  let idx = 0;
  for (const t of listTemplates()) {
    idx++;
    if (only && !only.has(t.id)) continue;
    if (args["sheet-only"]) { shots.push({ t, file: join(OUT, `${String(idx).padStart(2, "0")}-${t.id}_encarte-a4.png`) }); continue; }
    for (const { f, n, ov } of formats) {
      const camp = sampleCampaign(t, n, f === "cartaz_a4" ? { offset: 0 } : {});
      const html = pieceMarkup(t, f, camp, ov ?? {}, 0);
      const page = await openHtml(browser, html, { width: 2000, height: 2000 });
      const file = join(OUT, `${String(idx).padStart(2, "0")}-${t.id}_${fileFormat(f)}.png`);
      await page.locator("[data-ev-page-wrap]").first().screenshot({ path: file });
      await page.close();
      if (f === "encarte_a4") shots.push({ t, file });
      console.log("ok", file);
    }
  }
  // casos extras com o modelo padrão: 1, 40 produtos (todas as páginas), nomes longos e demais formatos
  if (!only && !args["sheet-only"]) {
    const t = listTemplates()[0];
    const extras: Array<{ name: string; f: FormatId; camp: ReturnType<typeof sampleCampaign>; all?: boolean }> = [
      { name: "encarte-a4_1-produto", f: "encarte_a4", camp: sampleCampaign(t, 1) },
      { name: "encarte-a4_40-produtos", f: "encarte_a4", camp: sampleCampaign(t, 40, { highlights: 2 }), all: true },
      { name: "encarte-a4_nomes-longos", f: "encarte_a4", camp: sampleCampaign(t, 12, { longNames: true }) },
      { name: "encarte-a4_sem-fotos", f: "encarte_a4", camp: sampleCampaign(t, 8, { noImages: true }) },
      { name: "post-feed", f: "post_feed", camp: sampleCampaign(t, 6) },
      { name: "cartaz-a3", f: "cartaz_a3", camp: sampleCampaign(t, 1, { offset: 4 }) },
      { name: "etiqueta-a4", f: "etiqueta_a4", camp: sampleCampaign(t, 8) },
      { name: "banner-vitrine", f: "banner_vitrine", camp: sampleCampaign(t, 4) },
      { name: "tv-horizontal", f: "tv_horizontal", camp: sampleCampaign(t, 6) },
    ];
    for (const e of extras) {
      const page = await openHtml(browser, pieceMarkup(t, e.f, e.camp, {}, e.all ? "all" : 0, 24), { width: 2000, height: 2000 });
      const file = join(OUT, `01-${t.id}_${e.name}.png`);
      await page.locator(e.all ? "[data-ev-render]" : "[data-ev-page-wrap]").first().screenshot({ path: file });
      await page.close();
      console.log("ok", file);
    }
  }
  // folha de contato com todos os modelos (encarte A4)
  if (!only || args["sheet-only"]) {
    const cards = shots.map(({ t, file }) => `<figure><img src="file://${file}"><figcaption><b>${t.name}</b><span>${t.id} · ${t.segments.join(", ")} · ${t.style}</span></figcaption></figure>`).join("");
    const css = `body{background:#f3f4f1;font-family:Inter,sans-serif;padding:32px} h1{font:800 34px Montserrat;margin:0 0 6px;color:#0d3b2e} p{margin:0 0 24px;color:#444;font-size:16px}
      .g{display:grid;grid-template-columns:repeat(4,1fr);gap:28px} figure{margin:0;background:#fff;border-radius:14px;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
      img{width:100%;display:block;border-radius:6px} figcaption{display:flex;flex-direction:column;gap:2px;padding-top:10px;font-size:15px} figcaption span{color:#555;font-size:13px}`;
    const page = await openHtml(browser, `<h1>Modelos de encarte — visão geral</h1><p>${shots.length} modelos · Encarte A4 com 12 produtos · DADOS DE DEMONSTRAÇÃO (loja e preços fictícios)</p><div class="g">${cards}</div>`, { width: 1800, height: 1200 }, css);
    await page.screenshot({ path: join(OUT, "00-visao-geral.png"), fullPage: true });
    await page.close();
    console.log("ok contact sheet");
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
