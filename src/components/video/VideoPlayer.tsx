"use client";
// Prévia animada do vídeo: a cena real (/render-video) num iframe em escala reduzida, com
// tocar/pausar e barra de tempo. A cena se comunica por postMessage (ev-video / ev-video-state).
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export interface PlayerScene { key: string; kind: "intro" | "products" | "outro"; start: number; end: number; items: string[] }

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function VideoPlayer({ url, vertical, duration, scenes }: { url: string | null; vertical: boolean; duration: number; scenes: PlayerScene[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { type?: string; t?: number; playing?: boolean };
      if (m?.type !== "ev-video-state") return;
      setLoaded(true);
      setT(Number(m.t) || 0);
      setPlaying(!!m.playing);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);
  useEffect(() => { setLoaded(false); setT(0); setPlaying(false); }, [url]);

  const send = useCallback((action: "play" | "pause" | "seek", time?: number) => {
    frame.current?.contentWindow?.postMessage({ type: "ev-video", action, t: time }, window.location.origin);
  }, []);

  const scene = scenes.find((s) => t >= s.start && t < s.end) ?? scenes[scenes.length - 1];
  const sceneText = !scene ? "" : scene.kind === "intro" ? "Abertura: logo e título" : scene.kind === "outro" ? "Encerramento: validade e contatos" : scene.items.join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <div className={cx("relative mx-auto w-full overflow-hidden rounded-2xl bg-ink", vertical ? "aspect-[9/16] max-w-[280px] sm:max-w-[300px]" : "aspect-video")}>
        {url ? (
          <iframe ref={frame} key={url} src={url} title="Prévia animada do vídeo" className="absolute inset-0 h-full w-full border-0" sandbox="allow-scripts allow-same-origin" />
        ) : null}
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80" aria-live="polite">Carregando prévia…</div>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => send(playing ? "pause" : "play")} disabled={!loaded}
          aria-label={playing ? "Pausar prévia" : "Tocar prévia"} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-50">
          {playing
            ? <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /></svg>
            : <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>}
        </button>
        <div className="relative min-w-0 flex-1">
          <input type="range" min={0} max={duration || 1} step={0.05} value={Math.min(t, duration)} disabled={!loaded}
            onChange={(e) => { const v = Number(e.target.value); setT(v); send("seek", v); }}
            aria-label="Posição na prévia" className="w-full accent-[rgb(var(--ev-brand))]" />
          <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1" aria-hidden>
            {scenes.slice(1).map((s) => <span key={s.key} className="absolute h-1 w-px bg-ink/30" style={{ left: `${(s.start / (duration || 1)) * 100}%` }} />)}
          </div>
        </div>
        <span className="w-[76px] shrink-0 text-right text-xs tabular-nums text-ink-muted">{mmss(t)} / {mmss(duration)}</span>
      </div>
      <p className="min-h-[2.5em] text-xs text-ink-muted" aria-live="off">{sceneText}</p>
    </div>
  );
}
