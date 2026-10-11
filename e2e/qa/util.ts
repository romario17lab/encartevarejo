import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { Client } from "pg";
import sharp from "sharp";

export const SHOTS = process.env.QA_EVIDENCE_DIR ? `${process.env.QA_EVIDENCE_DIR}/telas` : "/mnt/project-files/encartevarejo/validacao/telas";
mkdirSync(SHOTS, { recursive: true });
export const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${((Math.random() * 250) | 0) + 1}`;
export const rnd = () => Math.random().toString(36).slice(2, 8);

export async function sql<T = any>(q: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/ev_qa" });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}

/** Sem rolagem horizontal da página e todos os botões visíveis dentro da largura. */
export async function assertFits(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const w = window.innerWidth;
    const off: string[] = [];
    document.querySelectorAll<HTMLElement>("button, a, input, select, textarea").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") return;
      // ignora elementos dentro de contêineres com rolagem horizontal própria (abas, galerias)
      let p: HTMLElement | null = el.parentElement, scroller = false;
      while (p) { const s = getComputedStyle(p); if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth) { scroller = true; break; } p = p.parentElement; }
      if (!scroller && (b.right > w + 1 || b.left < -1)) off.push(`${el.tagName} "${(el.innerText || el.getAttribute("aria-label") || "").slice(0, 30)}" (${Math.round(b.left)}–${Math.round(b.right)})`);
    });
    return { sw: document.documentElement.scrollWidth, w, off };
  });
  expect(r.sw, `${label}: rolagem horizontal (${r.sw} > ${r.w})`).toBeLessThanOrEqual(r.w);
  expect(r.off, `${label}: controles fora da tela`).toEqual([]);
}

export async function shot(page: Page, name: string, project: string) {
  const sfx = project.startsWith("celular") ? "390" : "1280";
  await page.screenshot({ path: `${SHOTS}/${name}-${sfx}.png`, fullPage: sfx === "390" });
}

export async function photo(w: number, h: number, color: string) {
  const r = Math.min(w, h) * 0.4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff3d6"/><circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="${color}" stroke="#222" stroke-width="6"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

export async function apiSignup(request: APIRequestContext, label: string) {
  const email = `qa-ui-${label}-${Date.now()}-${rnd()}@exemplo.com`;
  const r = await request.post("/api/auth/signup", { headers: { "x-forwarded-for": ip() }, data: { name: `Lojista ${label}`, email, password: "senha-segura-123", orgName: `Mercado ${label}`, storeName: `Mercado ${label} ${rnd()}`, segment: "supermercado" } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const me = await (await request.get("/api/me")).json();
  return { email, password: "senha-segura-123", me };
}

export async function apiProduct(request: APIRequestContext, data: Record<string, unknown>) {
  const r = await request.post("/api/products", { data: { unit: "un", ...data } });
  expect(r.status()).toBe(201);
  const j = await r.json();
  return (j.id ? j : j.product) as { id: string };
}

export async function apiUpload(request: APIRequestContext, buf: Buffer, name: string) {
  const r = await request.post("/api/assets", { multipart: { file: { name, mimeType: "image/jpeg", buffer: buf }, source: "upload" } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()) as { id: string };
}
