// Pool simples de Chromium (playwright-core): um navegador reaproveitado e um limite de páginas
// simultâneas. Cada renderização usa um contexto novo (isolado) com a escala pedida.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const g = globalThis as unknown as { __evBrowser?: Promise<Browser> | null; __evSlots?: { busy: number; waiters: Array<() => void> } };
const MAX = Math.max(1, Number(process.env.EXPORT_MAX_PAGES ?? 2));
const slots = (g.__evSlots ??= { busy: 0, waiters: [] });

export async function getBrowser(): Promise<Browser> {
  if (!g.__evBrowser) {
    g.__evBrowser = chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--disable-gpu", "--hide-scrollbars"],
    }).then((b) => {
      b.on("disconnected", () => { g.__evBrowser = null; });
      return b;
    }).catch((e) => { g.__evBrowser = null; throw e; });
  }
  return g.__evBrowser;
}

async function acquire() {
  if (slots.busy < MAX) { slots.busy++; return; }
  await new Promise<void>((r) => slots.waiters.push(r));
  slots.busy++;
}
function release() {
  slots.busy--;
  slots.waiters.shift()?.();
}

/** Abre uma página isolada com viewport e escala, executa `fn` e fecha tudo (mesmo em erro). */
export async function withPage<T>(opts: { width: number; height: number; scale: number }, fn: (page: Page, ctx: BrowserContext) => Promise<T>): Promise<T> {
  await acquire();
  let ctx: BrowserContext | null = null;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      viewport: { width: Math.max(1, Math.ceil(opts.width)), height: Math.max(1, Math.ceil(opts.height)) },
      deviceScaleFactor: opts.scale,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    return await fn(page, ctx);
  } finally {
    await ctx?.close().catch(() => undefined);
    release();
  }
}

export async function closeBrowser(): Promise<void> {
  const b = g.__evBrowser;
  g.__evBrowser = null;
  if (b) await (await b).close().catch(() => undefined);
}
