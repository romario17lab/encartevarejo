// Dev (v2): mede a largura de cada caractere (em em) e as métricas verticais das fontes usadas nos
// títulos e preços dos modelos v2. Gera src/templates/parts2/glyphs-metrics.ts.
// Uso: npx tsx src/templates/__dev__/measure-glyphs.ts
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { htmlDocument } from "./html";

const fonts: Array<[string, number, string]> = [
  ["Anton", 400, "normal"], ["Bebas Neue", 400, "normal"], ["Oswald", 700, "normal"], ["Oswald", 600, "normal"],
  ["Montserrat", 900, "normal"], ["Montserrat", 800, "italic"], ["Playfair Display", 900, "normal"], ["Playfair Display", 700, "italic"],
  ["Inter", 900, "normal"], ["Inter", 800, "normal"], ["Inter", 700, "normal"],
];
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç0123456789 .,;:!?%$&/-+()'\"–—·ºª°²#@*";

(async () => {
  const dir = join(tmpdir(), "ev-dev");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "glyphs.html");
  writeFileSync(p, htmlDocument(fonts.map(([f, w, s]) => `<span style="font-family:'${f}';font-weight:${w};font-style:${s}">x</span>`).join("")));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const pg = await b.newPage();
  await pg.goto("file://" + p);
  await pg.evaluate(() => document.fonts.ready);
  const r = await pg.evaluate(({ fonts, CHARS }) => {
    const c = document.createElement("canvas").getContext("2d")!;
    const out: Record<string, { w: Record<string, number>; cap: number; asc: number; desc: number }> = {};
    for (const [f, w, s] of fonts) {
      const font = `${s} ${w} 100px "${f}"`;
      if (!document.fonts.check(font)) throw new Error("fonte ausente " + font);
      c.font = font;
      const widths: Record<string, number> = {};
      for (const ch of CHARS) widths[ch] = Math.round((c.measureText(ch).width / 100) * 1000) / 1000;
      const m = c.measureText("HEOR0123456789");
      const fm = c.measureText("Hg");
      out[`${f}|${w}|${s}`] = { w: widths, cap: Math.round(m.actualBoundingBoxAscent) / 100, asc: Math.round(fm.fontBoundingBoxAscent) / 100, desc: Math.round(fm.fontBoundingBoxDescent) / 100 };
    }
    return out;
  }, { fonts, CHARS });
  const file = join(process.cwd(), "src/templates/parts2/glyphs-metrics.ts");
  writeFileSync(file, `// GERADO por src/templates/__dev__/measure-glyphs.ts — não editar à mão.\n// Larguras por caractere (em) e métricas verticais (cap = altura das maiúsculas/algarismos; asc/desc da fonte).\nexport const GLYPHS: Record<string, { w: Record<string, number>; cap: number; asc: number; desc: number }> = ${JSON.stringify(r)};\n`);
  console.log("ok", file, Object.keys(r).map((k) => `${k} cap=${r[k].cap} asc=${r[k].asc} desc=${r[k].desc}`).join("\n"));
  await b.close();
})();
