// Documento HTML completo da cena (usado pelo worker e pelos testes, sem servidor Next):
// o MESMO componente <VideoScene/> da prévia, as mesmas fontes locais (@fontsource) e o mesmo runtime.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { VideoScene, type VideoSceneProps } from "@/render/video/Scene";

/** Origem fictícia interceptada pelo Playwright (nenhuma requisição sai da máquina). */
export const SCENE_ORIGIN = "http://ev-video.local";
export const FONT_PREFIX = "/__ev/fonts/";

const root = () => process.cwd();
const fontsourceDir = (pkg: string) => path.join(root(), "node_modules", "@fontsource", pkg);

let fontCss: string | null = null;
/** CSS @font-face de src/render/fonts.css, com URLs apontando para FONT_PREFIX. */
export function fontFaceCss(): string {
  if (fontCss !== null) return fontCss;
  const main = readFileSync(path.join(root(), "src", "render", "fonts.css"), "utf8");
  const out: string[] = [];
  for (const m of main.matchAll(/@import\s+"@fontsource\/([a-z0-9-]+)\/([a-z0-9-]+\.css)";/g)) {
    const [, pkg, file] = m;
    const p = path.join(fontsourceDir(pkg), file);
    if (!existsSync(p)) continue;
    out.push(readFileSync(p, "utf8").replace(/url\(\.\/files\/([^)]+)\)/g, (_s, f: string) => `url(${FONT_PREFIX}${pkg}/files/${f})`));
  }
  fontCss = out.join("\n");
  return fontCss;
}

/** Caminho local de uma fonte pedida pela página (lista fechada: só @fontsource/<pacote>/files/<arquivo>). */
export function resolveFontFile(urlPath: string): string | null {
  const m = /^\/__ev\/fonts\/([a-z0-9-]+)\/files\/([a-z0-9-]+\.(?:woff2|woff))$/.exec(urlPath);
  if (!m) return null;
  const p = path.join(fontsourceDir(m[1]), "files", m[2]);
  return existsSync(p) ? p : null;
}

export function buildSceneDocument(props: VideoSceneProps): string {
  const body = renderToStaticMarkup(<VideoScene {...props} />);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Vídeo</title><style>${fontFaceCss()}</style>`
    + `<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}*{-webkit-font-smoothing:antialiased}</style></head><body>${body}</body></html>`;
}
