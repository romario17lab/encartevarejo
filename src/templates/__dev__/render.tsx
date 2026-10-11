// Dev (Agente de Design): renderiza peças fora do Next (React → HTML estático → Chromium),
// usando o MESMO PieceRenderer da prévia/exportação. Base das amostras e da verificação de transbordo.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "playwright-core";
import { PieceRenderer } from "@/render/PieceRenderer";
import type { FormatId } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { TemplateDefinition } from "../contract";
import { htmlDocument } from "./html";

export const TMP_DIR = process.env.EV_DEV_TMP ?? join(tmpdir(), "ev-dev");

export function pieceMarkup(template: TemplateDefinition, format: FormatId, campaign: RenderCampaign, overrides: PieceOverrides = {}, pageIndex: number | "all" = "all", stackGap = 40): string {
  return renderToStaticMarkup(<PieceRenderer campaign={campaign} template={template} format={format} overrides={overrides} pageIndex={pageIndex} stackGap={stackGap} />);
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
}

let seq = 0;
/** Abre um HTML (corpo) numa aba, aguardando fontes e imagens. */
export async function openHtml(browser: Browser, body: string, viewport = { width: 1400, height: 1000 }, extraCss = ""): Promise<Page> {
  mkdirSync(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `doc-${process.pid}-${seq++}.html`);
  writeFileSync(file, htmlDocument(body, { extraCss }));
  const page = await browser.newPage({ viewport });
  await page.goto(`file://${file}`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
  });
  return page;
}
