/* Service worker do player da TV (escopo /tv). Mantém a TV tocando com a conexão instável:
 *  - páginas /tv e arquivos /_next: rede primeiro (com tempo limite), cópia em cache como reserva;
 *  - imagens (/api/assets/<id>) e vídeos (/api/tv/media/<id>): cache primeiro, chave = caminho SEM o token
 *    assinado (o arquivo de um id nunca muda; a URL é renovada a cada sincronização);
 *  - a programação (/api/tv/playlist) não passa por aqui: o player guarda a última versão boa.
 */
const SHELL = "ev-tv-shell-v1";
const MEDIA = "ev-tv-media-v1";
const NET_TIMEOUT_MS = 5000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try { const c = await caches.open(SHELL); await c.addAll(["/tv", "/tv/play"]); } catch (e) { /* offline na instalação */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, MEDIA];
    for (const k of await caches.keys()) if (k.startsWith("ev-tv-") && keep.indexOf(k) < 0) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)); }

async function networkFirst(request, key, store) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(request), timeout(NET_TIMEOUT_MS)]);
    if (store && res && res.ok && res.status === 200 && res.type === "basic") cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = (await cache.match(key)) || (request.mode === "navigate" ? (await cache.match("/tv/play")) : undefined);
    if (hit) return hit;
    throw e;
  }
}

async function mediaCacheFirst(request, key) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) cache.put(key, res.clone()).catch(() => {});
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith("/api/assets/") || p.startsWith("/api/tv/media/")) {
    if (req.headers.has("range")) return; // pedidos parciais vão direto à rede
    event.respondWith(mediaCacheFirst(req, p));
    return;
  }
  if (p.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    if (p === "/tv" || p.startsWith("/tv/")) {
      // /tv/l/<token>: não guarda (o token não vai para a chave do cache); offline abre o player
      event.respondWith(networkFirst(req, p, !p.startsWith("/tv/l/")));
    }
    return;
  }
  if (p.startsWith("/_next/") && !url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(req, p + url.search, true));
  }
});
