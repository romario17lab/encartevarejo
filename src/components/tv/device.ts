"use client";
// Armazenamento no aparelho (token, última programação boa) e cache de mídia para tocar offline.
import type { TvPlaylist } from "@/server/tv/types";

export const TOKEN_KEY = "ev_tv_token";
const PLAYLIST_KEY = "ev_tv_playlist";
export const MEDIA_CACHE = "ev-tv-media-v1";
export const SHELL_CACHE = "ev-tv-shell-v1";

export interface SavedPlaylist { etag: string; data: TvPlaylist; savedAt: number; clockOffset: number }

function ls(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function getToken(): string | null {
  try { return ls()?.getItem(TOKEN_KEY) ?? null; } catch { return null; }
}
export function setToken(token: string) {
  try { ls()?.setItem(TOKEN_KEY, token); } catch { /* sem armazenamento: o aparelho pareia de novo ao recarregar */ }
}
export function forgetDevice() {
  try { ls()?.removeItem(TOKEN_KEY); ls()?.removeItem(PLAYLIST_KEY); } catch { /* ignora */ }
  void (async () => { try { await caches.delete(MEDIA_CACHE); } catch { /* ignora */ } })();
}

/** Última programação boa (localStorage; se não couber, Cache Storage). */
export async function loadSavedPlaylist(): Promise<SavedPlaylist | null> {
  try {
    const raw = ls()?.getItem(PLAYLIST_KEY);
    if (raw) return JSON.parse(raw) as SavedPlaylist;
  } catch { /* tenta o cache */ }
  try {
    const res = await (await caches.open(SHELL_CACHE)).match("/tv/__programacao");
    return res ? ((await res.json()) as SavedPlaylist) : null;
  } catch { return null; }
}
export async function savePlaylist(p: SavedPlaylist) {
  const json = JSON.stringify(p);
  try { ls()?.setItem(PLAYLIST_KEY, json); return; } catch { /* cheio: usa o Cache Storage */ }
  try {
    ls()?.removeItem(PLAYLIST_KEY);
    await (await caches.open(SHELL_CACHE)).put("/tv/__programacao", new Response(json, { headers: { "content-type": "application/json" } }));
  } catch { /* sem armazenamento persistente */ }
}

/** Chave estável da mídia: caminho sem o token assinado (o mesmo arquivo continua em cache quando a URL é renovada). */
export const mediaKey = (url: string) => new URL(url, location.href).pathname;

/** Garante a mídia no cache (o service worker serve dali quando offline). */
export async function warmMedia(urls: string[]): Promise<void> {
  if (typeof caches === "undefined") return;
  let cache: Cache;
  try { cache = await caches.open(MEDIA_CACHE); } catch { return; }
  const wanted = new Set(urls.map(mediaKey));
  for (const url of urls) {
    try {
      if (await cache.match(mediaKey(url))) continue;
      const res = await fetch(url);
      if (res.ok && res.status === 200) await cache.put(mediaKey(url), res);
    } catch { /* tenta de novo na próxima sincronização */ }
  }
  // limpa mídia que saiu da programação
  try {
    for (const req of await cache.keys()) if (!wanted.has(new URL(req.url).pathname)) await cache.delete(req);
  } catch { /* ignora */ }
}

const blobUrls = new Map<string, string>();
/** URL local (blob) de um vídeo: do cache, ou baixado e guardado. Vídeo inteiro em memória = troca sem engasgo. */
export async function videoObjectUrl(url: string): Promise<string> {
  const key = mediaKey(url);
  const have = blobUrls.get(key);
  if (have) return have;
  let res: Response | undefined;
  try {
    const cache = await caches.open(MEDIA_CACHE);
    res = (await cache.match(key)) ?? undefined;
    if (!res) {
      const net = await fetch(url);
      if (!net.ok) throw new Error(String(net.status));
      await cache.put(key, net.clone());
      res = net;
    }
  } catch {
    res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
  }
  const obj = URL.createObjectURL(await res.blob());
  blobUrls.set(key, obj);
  return obj;
}
export function releaseVideos(keep: string[]) {
  const k = new Set(keep.map(mediaKey));
  for (const [key, obj] of blobUrls) if (!k.has(key)) { URL.revokeObjectURL(obj); blobUrls.delete(key); }
}

/** Registra o service worker do player (escopo /tv) e guarda os arquivos da página para abrir offline. */
export function setupOffline() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/tv-sw.js", { scope: "/tv" }).catch(() => { /* sem SW: segue online */ });
  const cacheShell = async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      const urls = new Set<string>([location.pathname]);
      for (const e of performance.getEntriesByType("resource")) {
        const u = new URL(e.name);
        if (u.origin === location.origin && u.pathname.startsWith("/_next/")) urls.add(u.pathname + u.search);
      }
      for (const u of urls) {
        if (await cache.match(u)) continue;
        try { const r = await fetch(u, { cache: "reload" }); if (r.ok) await cache.put(u, r); } catch { /* offline */ }
      }
    } catch { /* sem Cache Storage */ }
  };
  if (document.readyState === "complete") setTimeout(cacheShell, 3000);
  else window.addEventListener("load", () => setTimeout(cacheShell, 3000), { once: true });
}

/** Mantém a tela ligada (quando o navegador permite). */
export function keepAwake(): () => void {
  let lock: { release: () => Promise<void> } | null = null;
  let alive = true;
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
  const acquire = async () => {
    if (!alive || !nav.wakeLock || document.visibilityState !== "visible") return;
    try { lock = await nav.wakeLock.request("screen"); } catch { /* sem permissão */ }
  };
  const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
  void acquire();
  document.addEventListener("visibilitychange", onVis);
  return () => { alive = false; document.removeEventListener("visibilitychange", onVis); void lock?.release().catch(() => {}); };
}

export const hhmm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
