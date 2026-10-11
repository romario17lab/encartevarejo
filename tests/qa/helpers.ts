// Utilitários dos testes de aceitação (QA): cliente HTTP com cookie, cadastro real via API e acesso ao banco.
import { Client } from "pg";
import { mkdirSync } from "node:fs";

export const BASE = (process.env.QA_BASE_URL ?? "http://localhost:3105").replace(/\/$/, "");
export const DB_URL = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/ev_qa";
export const EVIDENCE = process.env.QA_EVIDENCE_DIR ?? "/mnt/project-files/encartevarejo/validacao";
mkdirSync(EVIDENCE, { recursive: true });

const rnd = () => Math.random().toString(36).slice(2, 10);
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${((Math.random() * 250) | 0) + 1}`;

export interface Res<T = any> { status: number; json: T; headers: Headers; buf: Buffer }

export class Api {
  cookie = "";
  ip = ip();
  async req<T = any>(method: string, path: string, body?: unknown, extra: { form?: FormData; headers?: Record<string, string> } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...(extra.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (extra.form) payload = extra.form;
    else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const r = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("ev_session=")) this.cookie = c.split(";")[0]!;
    const buf = Buffer.from(await r.arrayBuffer());
    let json: any = null;
    try { json = JSON.parse(buf.toString("utf8")); } catch { /* binário */ }
    return { status: r.status, json, headers: r.headers, buf };
  }
  get<T = any>(p: string) { return this.req<T>("GET", p); }
  post<T = any>(p: string, b?: unknown) { return this.req<T>("POST", p, b ?? {}); }
  put<T = any>(p: string, b?: unknown) { return this.req<T>("PUT", p, b); }
  patch<T = any>(p: string, b?: unknown) { return this.req<T>("PATCH", p, b); }
  del<T = any>(p: string) { return this.req<T>("DELETE", p); }
}

export interface Account { api: Api; email: string; password: string; userId: string; orgId: string; storeId: string; slug: string }

export async function signup(label = "QA", segment = "supermercado"): Promise<Account> {
  const api = new Api();
  const email = `qa-${label.toLowerCase()}-${rnd()}@exemplo.com`;
  const password = "senha-segura-123";
  const r = await api.post("/api/auth/signup", { name: `Lojista ${label}`, email, password, orgName: `Mercado ${label} ${rnd()}`, storeName: `Mercado ${label} ${rnd()}`, segment });
  if (r.status >= 300) throw new Error(`signup ${r.status} ${JSON.stringify(r.json)}`);
  const me = (await api.get("/api/me")).json;
  return { api, email, password, userId: r.json.userId, orgId: r.json.orgId, storeId: r.json.storeId, slug: me.stores[0].slug };
}

export async function product(a: Account, data: Record<string, unknown>) {
  const r = await a.api.post("/api/products", { unit: "un", ...data });
  if (r.status !== 201) throw new Error(`product ${r.status} ${JSON.stringify(r.json)}`);
  return (r.json.id ? r.json : r.json.product) as { id: string; name: string };
}

export const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

export async function campaign(a: Account, productIds: string[], extra: Record<string, unknown> = {}) {
  const r = await a.api.post("/api/campaigns", { storeId: a.storeId, name: `Campanha ${rnd()}`, templateId: "feira-da-semana", startsAt: days(-1), endsAt: days(5), productIds, ...extra });
  if (r.status >= 300) throw new Error(`campaign ${r.status} ${JSON.stringify(r.json)}`);
  return r.json as { campaign: { id: string; version: number; status: string; templateId: string; templateVersion: number }; items: any[]; pieces: any[] };
}

export async function sql<T = any>(q: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows as T[]; } finally { await c.end(); }
}

/** Espera um job de exportação terminar (worker real). */
export async function waitExport(a: Account, jobId: string, timeoutMs = 540_000) {
  const t0 = Date.now();
  const seen = new Set<string>();
  for (;;) {
    const r = await a.api.get(`/api/exports/${jobId}`);
    const j = r.json.job ?? r.json;
    seen.add(j.status);
    if (j.status === "concluida" || j.status === "falhou") return { job: j, seen: [...seen] };
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout export ${jobId} (${[...seen].join(",")})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
