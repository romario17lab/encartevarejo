"use client";
import { useEffect } from "react";

declare global {
  interface Window { __EV_READY?: boolean; __EV_IMG_ERRORS?: string[] }
}

function waitImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

/** Marca window.__EV_READY = true quando fontes e imagens (inclusive de fundo) terminaram de carregar. */
export function ReadySignal() {
  useEffect(() => {
    let alive = true;
    (async () => {
      const errors: string[] = [];
      try { await document.fonts.ready; } catch { /* segue mesmo sem a API */ }
      const imgs = Array.from(document.querySelectorAll("img"));
      await Promise.all(imgs.map(async (img) => {
        if (!img.complete) await new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); });
        if (!img.naturalWidth) errors.push(img.currentSrc || img.src);
        else { try { await img.decode(); } catch { /* já carregada */ } }
      }));
      const bgUrls = new Set<string>();
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ev-render] *"))) {
        const bg = getComputedStyle(el).backgroundImage;
        for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) bgUrls.add(m[1]);
      }
      await Promise.all([...bgUrls].map(async (u) => { if (!(await waitImage(u))) errors.push(u); }));
      try { await document.fonts.ready; } catch { /* idem */ }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!alive) return;
      window.__EV_IMG_ERRORS = errors;
      window.__EV_READY = true;
      document.documentElement.dataset.evReady = "1";
    })();
    return () => { alive = false; };
  }, []);
  return null;
}
