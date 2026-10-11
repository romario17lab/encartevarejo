// Abre /render/:id (a MESMA página usada pelo worker na exportação) no Chromium e mede a composição.
import { chromium, type Browser } from "playwright-core";
import { FORMATS, type FormatId } from "@/domain/formats";
import { signRenderToken } from "@/server/export/render-token";
import { BASE } from "./helpers";

export const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export const launch = () => chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"] });

export interface CellInfo { page: number; id: string; name: string; aria: string; priceText: string; problems: string[]; photo?: { natural: number; box: number; objectFit: string; drawn: number } }
export interface Inspection { pages: number; cells: CellInfo[]; problems: string[]; screenshots: Buffer[] }

export function renderUrl(campaignId: string, orgId: string, version: number, format: FormatId, page: number | "all" = "all") {
  const t = signRenderToken({ cid: campaignId, org: orgId, v: version }, 900);
  return `${BASE}/render/${campaignId}?f=${format}&p=${page}&v=${version}&t=${encodeURIComponent(t)}`;
}

export async function inspect(browser: Browser, campaignId: string, orgId: string, version: number, format: FormatId, opts: { shots?: number; scale?: number } = {}): Promise<Inspection> {
  const f = FORMATS[format];
  const ctx = await browser.newContext({ viewport: { width: f.widthPx, height: f.heightPx }, deviceScaleFactor: opts.scale ?? 1, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  try {
    await page.goto(renderUrl(campaignId, orgId, version, format), { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => (window as any).__EV_READY === true, null, { timeout: 120_000 });
    const res = await page.evaluate(() => {
      const tol = 1;
      const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
      const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;
      const problems: string[] = [];
      const cells: any[] = [];
      const err = document.querySelector("[data-ev-render-error]");
      if (err) problems.push(`erro de renderização: ${err.getAttribute("data-ev-render-error")}`);
      const roots = [...document.querySelectorAll<HTMLElement>("[data-ev-root]")];
      roots.forEach((root, pi) => {
        const pr = root.getBoundingClientRect();
        const cs = [...root.querySelectorAll<HTMLElement>("[data-ev-cell]")];
        const rects = cs.map((c) => c.getBoundingClientRect());
        cs.forEach((cell, i) => {
          const p: string[] = [];
          if (!inside(rects[i]!, pr)) p.push("célula fora da página");
          for (let j = i + 1; j < cs.length; j++) if (overlap(rects[i]!, rects[j]!)) p.push(`sobrepõe ${cs[j]!.dataset.evCell}`);
          const price = cell.querySelector<HTMLElement>("[data-ev-price]");
          const inner = cell.querySelector<HTMLElement>("[data-ev-price-inner]");
          const name = cell.querySelector<HTMLElement>("[data-ev-name]");
          if (!price) p.push("sem bloco de preço");
          else {
            const r = price.getBoundingClientRect();
            if (!inside(r, rects[i]!)) p.push("preço sai do card");
            if (!inside(r, pr)) p.push("preço fora da página");
            if (name && overlap(name.getBoundingClientRect(), r)) p.push("nome sobrepõe o preço");
          }
          if (inner && (inner.scrollWidth > inner.clientWidth + 1 || inner.scrollHeight > inner.clientHeight + 1)) p.push(`preço cortado (${inner.scrollWidth}x${inner.scrollHeight} > ${inner.clientWidth}x${inner.clientHeight})`);
          if (inner) inner.querySelectorAll<HTMLElement>("*").forEach((el) => {
            if (el.children.length === 0 && el.textContent?.trim() && (el.scrollWidth > el.clientWidth + 1) && getComputedStyle(el).textOverflow === "ellipsis") p.push(`texto do preço com reticências: "${el.textContent.trim()}"`);
          });
          if (name && !inside(name.getBoundingClientRect(), rects[i]!)) p.push("nome sai do card");
          cell.querySelectorAll<HTMLElement>("[data-ev-badge],[data-ev-hero]").forEach((b) => { if (!inside(b.getBoundingClientRect(), pr)) p.push("selo fora da página"); });
          let photo: any;
          const img = cell.querySelector<HTMLImageElement>("[data-ev-photo] img");
          if (img && img.naturalWidth) {
            const st = getComputedStyle(img);
            const box = img.getBoundingClientRect();
            const nat = img.naturalWidth / img.naturalHeight;
            const boxAr = box.width / box.height;
            // com contain, a imagem desenhada mantém a proporção natural
            const drawn = st.objectFit === "contain" || st.objectFit === "cover" || st.objectFit === "scale-down" ? nat : boxAr;
            photo = { natural: nat, box: boxAr, objectFit: st.objectFit, drawn };
            if (Math.abs(drawn - nat) / nat > 0.01) p.push(`foto distorcida (${nat.toFixed(2)} → ${drawn.toFixed(2)})`);
          } else if (img && !img.naturalWidth) p.push("foto não carregou");
          cells.push({ page: pi, id: cell.dataset.evCell!, name: name?.innerText ?? "", aria: price?.getAttribute("aria-label") ?? "", priceText: (inner?.innerText ?? "").replace(/\s+/g, ""), problems: p, photo });
        });
        const title = root.querySelector<HTMLElement>("[data-ev-title]");
        if (title && !inside(title.getBoundingClientRect(), pr)) problems.push(`p${pi + 1}: título fora da página`);
        root.querySelectorAll<HTMLElement>("[data-ev-footer],[data-ev-header]").forEach((el) => { if (!inside(el.getBoundingClientRect(), pr)) problems.push(`p${pi + 1}: cabeçalho/rodapé fora da página`); });
      });
      return { pages: roots.length, cells, problems };
    });
    const screenshots: Buffer[] = [];
    for (let i = 0; i < Math.min(opts.shots ?? 0, res.pages); i++) screenshots.push(await page.locator(`[data-ev-page="${i}"]`).screenshot({ type: "png" }));
    return { ...res, screenshots };
  } finally {
    await ctx.close();
  }
}
