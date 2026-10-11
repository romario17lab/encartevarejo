"use client";
// Player da TV da loja.
//  - Programação: GET /api/tv/playlist (token do aparelho) a cada ~45 s, ao voltar a conexão e ao voltar a ficar visível,
//    com If-None-Match; mudanças entram na PRÓXIMA troca de slide (sem tela preta: o próximo slide carrega por trás).
//  - Conexão instável: última programação boa guardada no aparelho, mídia em cache (service worker /tv-sw.js),
//    nova tentativa com espera exponencial, aviso discreto "Sem conexão desde HH:MM".
//  - Agendamento e validade avaliados no próprio aparelho (mesmo código do servidor): oferta vencida sai mesmo offline.
import { useCallback, useEffect, useRef, useState } from "react";
import { isScheduleActive } from "@/server/tv/schedule";
import type { TvCampaignItem, TvItem, TvPlaylist, TvVideoItem } from "@/server/tv/types";
import { CampaignSlide } from "./TvSlide";
import {
  forgetDevice, getToken, hhmm, keepAwake, loadSavedPlaylist, releaseVideos, savePlaylist, setupOffline, videoObjectUrl, warmMedia, type SavedPlaylist,
} from "./device";

export type Slide =
  | { key: string; sig: string; kind: "campaign"; item: TvCampaignItem; page: number; seconds: number; position: number }
  | { key: string; sig: string; kind: "video"; item: TvVideoItem; position: number };

/** Slides que tocam neste instante, na ordem da programação (cada página de campanha = um slide). */
export function buildSlides(pl: TvPlaylist | null | undefined, now: Date, skip: Set<string> = new Set()): Slide[] {
  if (!pl) return [];
  const all: TvItem[] = [...pl.items, ...pl.upcoming].sort((a, b) => a.position - b.position);
  const out: Slide[] = [];
  for (const it of all) {
    if (it.validUntil && now.getTime() >= Date.parse(it.validUntil)) continue;
    if (it.validFrom && now.getTime() < Date.parse(it.validFrom)) continue;
    if (!isScheduleActive(it.schedule, now)) continue;
    if (it.kind === "campaign") {
      for (let p = 0; p < it.pages; p++) {
        const key = `${it.id}#${p}`;
        if (!skip.has(key)) out.push({ key, sig: `${pl.version}|${key}`, kind: "campaign", item: it, page: p, seconds: it.slideSeconds, position: it.position });
      }
    } else if (!skip.has(it.id)) out.push({ key: it.id, sig: `${pl.version}|${it.id}`, kind: "video", item: it, position: it.position });
  }
  return out;
}

function pickNext(slides: Slide[], cur: Slide | null): Slide {
  if (!cur) return slides[0]!;
  const idx = slides.findIndex((s) => s.key === cur.key);
  if (idx >= 0) return slides[(idx + 1) % slides.length]!;
  const curPage = cur.kind === "campaign" ? cur.page : 0;
  return slides.find((s) => s.position > cur.position || (s.position === cur.position && (s.kind === "campaign" ? s.page : 0) > curPage)) ?? slides[0]!;
}

function mediaUrls(pl: TvPlaylist) {
  const images = new Set<string>();
  const videos: string[] = [];
  for (const it of [...pl.items, ...pl.upcoming]) {
    if (it.kind === "video") videos.push(it.url);
    else {
      if (it.campaign.brand.logoUrl) images.add(it.campaign.brand.logoUrl);
      for (const i of it.campaign.items) if (i.imageUrl) images.add(i.imageUrl);
    }
  }
  return { images: [...images], videos };
}

interface LayerState { slide: Slide; nonce: number }
type Mode = "loading" | "playing" | "idle" | "unpaired" | "blocked";

export function TvPlayer() {
  const plRef = useRef<SavedPlaylist | null>(null);
  const [layers, setLayers] = useState<[LayerState | null, LayerState | null]>([null, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const frontRef = useRef<0 | 1>(0);
  const currentRef = useRef<Slide | null>(null);
  const pendingRef = useRef<{ slide: Slide; layer: 0 | 1; nonce: number } | null>(null);
  const nonceRef = useRef(0);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0);
  const failedUntil = useRef(new Map<string, number>());
  const [mode, setModeState] = useState<Mode>("loading");
  const modeRef = useRef<Mode>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [replay, setReplay] = useState(0);
  const [, tick] = useState(0);

  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
  const now = () => new Date(Date.now() + (plRef.current?.clockOffset ?? 0));

  const skipSet = () => {
    const t = Date.now();
    const s = new Set<string>();
    for (const [k, until] of failedUntil.current) { if (until > t) s.add(k); else failedUntil.current.delete(k); }
    return s;
  };

  const advanceRef = useRef<() => void>(() => {});

  const startTimer = useCallback((slide: Slide) => {
    clearTimeout(slideTimer.current);
    const ms = slide.kind === "campaign" ? slide.seconds * 1000 : ((slide.item.maxSeconds ?? slide.item.durationSec + 15) * 1000);
    slideTimer.current = setTimeout(() => advanceRef.current(), Math.max(2000, ms));
  }, []);

  const flip = useCallback((nonce: number) => {
    const p = pendingRef.current;
    if (!p || p.nonce !== nonce) return;
    clearTimeout(readyTimer.current);
    pendingRef.current = null;
    const old = frontRef.current;
    frontRef.current = p.layer;
    setFront(p.layer);
    currentRef.current = p.slide;
    startTimer(p.slide);
    // depois da transição, descarrega a camada de trás (libera vídeo/imagens)
    setTimeout(() => setLayers((prev) => {
      if (frontRef.current === old || pendingRef.current?.layer === old) return prev;
      const c: [LayerState | null, LayerState | null] = [prev[0], prev[1]];
      c[old] = null;
      return c;
    }), 900);
  }, [startTimer]);

  const advance = useCallback(() => {
    clearTimeout(slideTimer.current);
    if (modeRef.current === "unpaired" || modeRef.current === "blocked") return;
    const slides = buildSlides(plRef.current?.data, now(), skipSet());
    if (!slides.length) {
      currentRef.current = null;
      pendingRef.current = null;
      setLayers([null, null]);
      setMode(plRef.current ? "idle" : "loading");
      slideTimer.current = setTimeout(() => advanceRef.current(), 5000);
      return;
    }
    const cur = currentRef.current;
    const next = pickNext(slides, cur);
    if (cur && next.sig === cur.sig) {
      // um único slide: continua na tela (vídeo recomeça)
      if (next.kind === "video") setReplay((r) => r + 1);
      startTimer(next);
      return;
    }
    const back: 0 | 1 = frontRef.current === 0 ? 1 : 0;
    const nonce = ++nonceRef.current;
    pendingRef.current = { slide: next, layer: back, nonce };
    setLayers((prev) => {
      const c: [LayerState | null, LayerState | null] = [prev[0], prev[1]];
      c[back] = { slide: next, nonce };
      return c;
    });
    setMode("playing");
    clearTimeout(readyTimer.current);
    readyTimer.current = setTimeout(() => flip(nonce), 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flip, startTimer]);
  advanceRef.current = advance;

  const onLayerFail = useCallback((nonce: number, key: string) => {
    failedUntil.current.set(key, Date.now() + 60_000);
    if (pendingRef.current?.nonce === nonce) {
      pendingRef.current = null;
      clearTimeout(readyTimer.current);
      advanceRef.current();
    } else if (currentRef.current?.key === key) advanceRef.current();
  }, []);

  // ---------------- sincronização
  const sync = useCallback(async () => {
    clearTimeout(pollTimer.current);
    const token = getToken();
    if (!token) { window.location.replace("/tv"); return; }
    const schedule = (sec: number) => { clearTimeout(pollTimer.current); pollTimer.current = setTimeout(() => void syncRef.current(), sec * 1000 * (0.85 + Math.random() * 0.3)); };
    const offline = () => {
      failures.current += 1;
      setOfflineSince((s) => s ?? Date.now());
      schedule(Math.min(300, 5 * 2 ** (failures.current - 1)));
    };
    let res: Response;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (plRef.current?.etag && modeRef.current !== "blocked") headers["if-none-match"] = plRef.current.etag;
      res = await fetch("/api/tv/playlist", { headers, cache: "no-store" });
    } catch { offline(); return; }
    if (res.status === 401) {
      forgetDevice();
      plRef.current = null;
      setLayers([null, null]);
      setMessage("Esta tela foi desconectada na gestão.");
      setMode("unpaired");
      setTimeout(() => window.location.replace("/tv?motivo=desconectada"), 8000);
      return;
    }
    if (res.status === 402 || res.status === 403) {
      const data = await res.json().catch(() => null);
      plRef.current = null;
      setLayers([null, null]);
      currentRef.current = null;
      setMessage(data?.error?.message ?? "Esta tela não está disponível no momento.");
      setMode("blocked");
      failures.current = 0;
      setOfflineSince(null);
      schedule(300);
      return;
    }
    if (res.status >= 500 || (!res.ok && res.status !== 304)) { offline(); return; }
    failures.current = 0;
    setOfflineSince(null);
    if (modeRef.current === "blocked") { setMessage(null); setMode("loading"); }
    if (res.status === 304) { schedule(plRef.current?.data.pollSeconds ?? 45); return; }
    let data: TvPlaylist;
    try { data = (await res.json()) as TvPlaylist; } catch { offline(); return; }
    const saved: SavedPlaylist = { etag: res.headers.get("etag") ?? `"${data.version}"`, data, savedAt: Date.now(), clockOffset: Date.parse(data.serverTime) - Date.now() || 0 };
    plRef.current = saved;
    void savePlaylist(saved);
    const media = mediaUrls(data);
    releaseVideos(media.videos);
    void warmMedia([...media.images, ...media.videos]);
    if (modeRef.current !== "playing") advanceRef.current();
    schedule(data.pollSeconds || 45);
  }, []);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // ---------------- início
  useEffect(() => {
    if (!getToken()) { window.location.replace("/tv"); return; }
    setupOffline();
    const release = keepAwake();
    let alive = true;
    void (async () => {
      const saved = await loadSavedPlaylist();
      if (!alive) return;
      if (saved && !plRef.current) { plRef.current = saved; advanceRef.current(); }
      void syncRef.current();
    })();
    const onOnline = () => void syncRef.current();
    const onOffline = () => setOfflineSince((s) => s ?? Date.now());
    const onVis = () => { if (document.visibilityState === "visible") void syncRef.current(); };
    const goFull = () => { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", goFull);
    window.addEventListener("click", goFull);
    // validade local: oferta vencida sai na hora, mesmo sem conexão
    const guard = setInterval(() => {
      tick((t) => t + 1);
      const cur = currentRef.current;
      const t = now().getTime();
      if (cur && cur.item.validUntil && t >= Date.parse(cur.item.validUntil)) advanceRef.current();
    }, 15_000);
    return () => {
      alive = false;
      release();
      clearInterval(guard);
      clearTimeout(pollTimer.current); clearTimeout(slideTimer.current); clearTimeout(readyTimer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", goFull);
      window.removeEventListener("click", goFull);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screen = plRef.current?.data.screen;
  return (
    <main data-tv-player={mode} style={{ position: "fixed", inset: 0, background: "#000", cursor: "none", overflow: "hidden", userSelect: "none", fontFamily: "Inter, system-ui, sans-serif" }}>
      {[0, 1].map((i) => {
        const l = layers[i];
        if (!l) return null;
        return (
          <Layer key={l.nonce} state={l} isFront={front === i} replay={front === i ? replay : 0}
            onReady={flip} onEnded={() => { if (frontRef.current === i && !pendingRef.current) advanceRef.current(); }} onFail={onLayerFail} />
        );
      })}
      {mode === "loading" && <Center title="Carregando a programação…" />}
      {mode === "idle" && <Center title="Nenhuma oferta programada para este horário" subtitle={screen ? `${screen.storeName} · ${screen.name}` : undefined} clock={hhmm(now())} />}
      {mode === "unpaired" && <Center title={message ?? "Tela desconectada"} subtitle="Para usar de novo, gere um código de pareamento na gestão." />}
      {mode === "blocked" && <Center title={message ?? "Indisponível"} subtitle="A TV volta sozinha quando o recurso for liberado." />}
      {offlineSince && (
        <div role="status" data-tv-offline="" style={{
          position: "fixed", right: "2vw", bottom: "2.2vh", zIndex: 10, display: "flex", alignItems: "center", gap: "0.6em",
          padding: "0.45em 0.9em", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "rgba(255,255,255,.92)", fontSize: "max(14px, 1.6vh)", fontWeight: 600,
        }}>
          <span aria-hidden="true" style={{ width: "0.6em", height: "0.6em", borderRadius: "50%", background: "#f87171" }} />
          Sem conexão desde {hhmm(new Date(offlineSince))}
        </div>
      )}
    </main>
  );
}

function Center({ title, subtitle, clock }: { title: string; subtitle?: string; clock?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2vh", padding: "6vw", textAlign: "center", color: "#fff", background: "radial-gradient(circle at 50% 0%, #12372c 0%, #000 70%)" }}>
      {clock && <p style={{ margin: 0, fontSize: "max(40px, 9vh)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{clock}</p>}
      <p style={{ margin: 0, fontSize: "max(24px, 4.4vh)", fontWeight: 700, maxWidth: "80vw" }}>{title}</p>
      {subtitle && <p style={{ margin: 0, fontSize: "max(16px, 2.6vh)", color: "rgba(255,255,255,.7)" }}>{subtitle}</p>}
    </div>
  );
}

function Layer({ state, isFront, replay, onReady, onEnded, onFail }: {
  state: LayerState; isFront: boolean; replay: number; onReady: (nonce: number) => void; onEnded: (nonce: number) => void; onFail: (nonce: number, key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const { slide, nonce } = state;
  const readySent = useRef(false);
  const ready = useCallback(() => { if (!readySent.current) { readySent.current = true; onReady(nonce); } }, [nonce, onReady]);

  // campanha: espera imagens e fontes (no máx. 5 s, pelo temporizador do player)
  useEffect(() => {
    if (slide.kind !== "campaign") return;
    let alive = true;
    void (async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const imgs = Array.from(ref.current?.querySelectorAll("img") ?? []);
      await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); }))));
      try { await document.fonts.ready; } catch { /* sem API */ }
      if (alive) ready();
    })();
    return () => { alive = false; };
  }, [slide, ready]);

  // vídeo: arquivo local (cache) e pronto para tocar
  useEffect(() => {
    if (slide.kind !== "video") return;
    let alive = true;
    videoObjectUrl(slide.item.url).then((u) => { if (alive) setSrc(u); }).catch(() => { if (alive) onFail(nonce, slide.key); });
    return () => { alive = false; };
  }, [slide, nonce, onFail]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isFront) return;
    v.currentTime = 0;
    v.muted = true;
    v.play().catch(() => onFail(nonce, slide.key));
  }, [isFront, replay, nonce, slide.key, onFail]);

  return (
    <div ref={ref} data-tv-layer={isFront ? "front" : "back"} data-tv-slide={slide.key} style={{ position: "absolute", inset: 0, background: "#000", opacity: isFront ? 1 : 0, zIndex: isFront ? 2 : 1, transition: "opacity 600ms ease" }}>
      {slide.kind === "campaign" ? <CampaignSlide item={slide.item} page={slide.page} /> : src && (
        <video ref={videoRef} src={src} muted playsInline preload="auto" onCanPlay={ready} onEnded={() => onEnded(nonce)} onError={() => onFail(nonce, slide.key)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
      )}
    </div>
  );
}
