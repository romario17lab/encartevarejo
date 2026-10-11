// Utilitário de desenvolvimento (Agente de Design): monta um documento HTML completo
// com as fontes de src/render/fonts.css embutidas como URLs file:// locais,
// para renderizar modelos fora do Next (capturas e verificação de transbordo).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const ROOT = resolve(process.cwd());
const require_ = createRequire(join(ROOT, "package.json"));

let cachedCss: string | null = null;

/** CSS de fontes com @import resolvidos e url() absolutos (file://). */
export function inlineFontsCss(): string {
  if (cachedCss) return cachedCss;
  const src = readFileSync(join(ROOT, "src/render/fonts.css"), "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/@import\s+"([^"]+)";/g)) {
    const file = require_.resolve(m[1]);
    const css = readFileSync(file, "utf8").replace(/url\(\.\/files\/([^)]+)\)/g, (_s, f) => `url(file://${join(dirname(file), "files", f)})`);
    out.push(css);
  }
  cachedCss = out.join("\n");
  return cachedCss;
}

export function htmlDocument(body: string, opts: { title?: string; extraCss?: string } = {}): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><script>window.__name=function(f){return f}</script><title>${opts.title ?? "EncarteVarejo"}</title>
<style>${inlineFontsCss()}
html,body{margin:0;padding:0;background:#fff}
*{box-sizing:border-box}
${opts.extraCss ?? ""}</style></head><body>${body}</body></html>`;
}
