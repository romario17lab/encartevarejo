"use client";
// Um slide da TV: a MESMA peça exportada (PieceRenderer, formato tv_horizontal ou story), em tamanho nativo,
// encaixada no espaço disponível com transform: scale (sem distorcer). Usado no player e na prévia da gestão.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FORMATS } from "@/domain/formats";
import { PieceRenderer } from "@/render/PieceRenderer";
import type { TvCampaignItem } from "@/server/tv/types";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Encaixa um conteúdo de width×height no contêiner (contain), centralizado. */
export function FitBox({ width, height, children, background = "transparent" }: { width: number; height: number; children: ReactNode; background?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((prev) => (prev && prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = box ? Math.min(box.w / width, box.h / height) : 0;
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden", background }}>
      {scale > 0 && (
        <div style={{
          position: "absolute", left: Math.round((box!.w - width * scale) / 2), top: Math.round((box!.h - height * scale) / 2),
          width, height, transform: `scale(${scale})`, transformOrigin: "0 0",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function CampaignSlide({ item, page }: { item: TvCampaignItem; page: number }) {
  const format = FORMATS[item.format];
  return (
    <FitBox width={format.widthPx} height={format.heightPx}>
      <PieceRenderer campaign={item.campaign} template={{ id: item.templateId, version: item.templateVersion }} format={format} overrides={item.overrides} pageIndex={page} />
    </FitBox>
  );
}
