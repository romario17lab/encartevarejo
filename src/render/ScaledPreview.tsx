"use client";
// Prévia escalada (editor) e verificação de transbordo medida no DOM real.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { LayoutWarning } from "@/templates/contract";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface ScaledPreviewProps {
  /** tamanho nativo do conteúdo (px do formato; com várias páginas empilhadas, a altura total) */
  width: number;
  height: number;
  children: ReactNode;
  /** "width": ocupa a largura do contêiner; "contain": cabe inteiro na largura e na altura disponíveis */
  fit?: "width" | "contain";
  /** altura máxima disponível (px) quando fit = "contain"; padrão: altura do contêiner pai */
  maxHeight?: number;
  /** nunca amplia além do tamanho nativo */
  maxScale?: number;
  className?: string;
  style?: CSSProperties;
  /** rótulo acessível da prévia */
  label?: string;
  /** ref para o conteúdo em tamanho nativo (para useOverflowCheck) */
  contentRef?: RefObject<HTMLDivElement | null>;
  onScale?: (scale: number) => void;
}

/** Encaixa uma página (ou páginas) no contêiner com transform: scale, sem distorcer. */
export function ScaledPreview({ width, height, children, fit = "width", maxHeight, maxScale = 1, className, style, label, contentRef, onScale }: ScaledPreviewProps) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const measure = useCallback(() => {
    const el = outer.current;
    if (!el || width <= 0 || height <= 0) return;
    const availW = el.clientWidth;
    let s = availW / width;
    if (fit === "contain") {
      const availH = maxHeight ?? el.parentElement?.clientHeight ?? 0;
      if (availH > 0) s = Math.min(s, availH / height);
    }
    s = Math.max(0.01, Math.min(maxScale, s));
    setScale((prev) => (Math.abs(prev - s) > 0.0005 ? s : prev));
  }, [width, height, fit, maxHeight, maxScale]);

  useIsoLayoutEffect(() => {
    measure();
    const el = outer.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    if (fit === "contain" && el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [measure, fit]);

  useEffect(() => { if (scale > 0) onScale?.(scale); }, [scale, onScale]);

  return (
    <div ref={outer} className={className} role={label ? "img" : undefined} aria-label={label} style={{ width: "100%", ...style }}>
      <div style={{ position: "relative", width: Math.round(width * scale), height: Math.round(height * scale), overflow: "hidden", margin: fit === "contain" ? "0 auto" : undefined }}>
        <div
          ref={contentRef}
          style={{ position: "absolute", left: 0, top: 0, width, height, transform: `scale(${scale || 0.0001})`, transformOrigin: "0 0", visibility: scale ? "visible" : "hidden" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface Box { left: number; top: number; right: number; bottom: number }
const box = (el: Element): Box => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
const intersects = (a: Box, b: Box, tol: number) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;
const outside = (inner: Box, outer: Box, tol: number) => inner.left < outer.left - tol || inner.top < outer.top - tol || inner.right > outer.right + tol || inner.bottom > outer.bottom + tol;

/**
 * Mede o DOM renderizado e devolve avisos em português:
 *  - preço ([data-ev-price]) ou texto ([data-ev-text]) que não cabe no seu card ([data-ev-cell])
 *  - card fora da página ([data-ev-page])
 *  - dois cards se sobrepondo
 * Os modelos marcam: data-ev-cell={item.id} no card, data-ev-price no bloco do preço,
 * data-ev-text nos blocos de texto que não podem ser cortados; o nome vem de `names`, de data-ev-name ou do aria-label do card.
 */
export function measureOverflow(root: HTMLElement, names: Record<string, string> = {}): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  const seen = new Set<string>();
  const push = (w: LayoutWarning) => { const k = `${w.code}|${w.itemId ?? ""}|${w.message}`; if (!seen.has(k)) { seen.add(k); warnings.push(w); } };
  // tolerância de 1 px na escala atual
  const scaleOf = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };
  const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-ev-page]"));
  for (const page of pages) {
    const pageIndex = Number(page.dataset.evPage ?? 0);
    const tol = Math.max(0.5, scaleOf(page));
    const pageBox = box(page);
    const cells = Array.from(page.querySelectorAll<HTMLElement>("[data-ev-cell]"));
    const nameOf = (cell: HTMLElement) => names[cell.dataset.evCell ?? ""] || cell.dataset.evName || cell.getAttribute("aria-label") || "um produto";
    const cellBoxes = cells.map((c) => ({ el: c, b: box(c) }));
    for (const { el, b } of cellBoxes) {
      const itemId = el.dataset.evCell || undefined;
      if (outside(b, pageBox, tol)) push({ code: "overflow", itemId, pageIndex, message: `O card de “${nameOf(el)}” passa da borda da página ${pageIndex + 1}.` });
      for (const t of Array.from(el.querySelectorAll<HTMLElement>("[data-ev-price], [data-ev-text]"))) {
        const tb = box(t);
        const clipped = t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1;
        if (outside(tb, b, tol) || clipped) {
          const what = t.hasAttribute("data-ev-price") ? "O preço" : "Um texto";
          push({ code: "overflow", itemId, pageIndex, message: `${what} de “${nameOf(el)}” não cabe no card (página ${pageIndex + 1}). Reduza o texto ou a quantidade de produtos por página.` });
        }
      }
    }
    for (let i = 0; i < cellBoxes.length; i++)
      for (let j = i + 1; j < cellBoxes.length; j++)
        if (intersects(cellBoxes[i].b, cellBoxes[j].b, tol))
          push({ code: "overlap", itemId: cellBoxes[i].el.dataset.evCell, pageIndex, message: `Os cards de “${nameOf(cellBoxes[i].el)}” e “${nameOf(cellBoxes[j].el)}” estão sobrepostos na página ${pageIndex + 1}.` });
  }
  return warnings;
}

/**
 * Hook: verifica transbordo/sobreposição após cada renderização (e quando fontes terminam de carregar).
 * `deps` deve mudar quando o conteúdo mudar (ex.: versão da campanha + formato + página).
 */
export function useOverflowCheck(ref: RefObject<HTMLElement | null>, deps: unknown[] = [], names: Record<string, string> = {}): LayoutWarning[] {
  const [warnings, setWarnings] = useState<LayoutWarning[]>([]);
  const namesKey = JSON.stringify(names);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled || !ref.current) return;
      const next = measureOverflow(ref.current, JSON.parse(namesKey));
      setWarnings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const raf = requestAnimationFrame(run);
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.ready.then(() => requestAnimationFrame(run));
    const imgs = ref.current ? Array.from(ref.current.querySelectorAll("img")) : [];
    for (const img of imgs) if (!img.complete) img.addEventListener("load", run, { once: true });
    return () => { cancelled = true; cancelAnimationFrame(raf); for (const img of imgs) img.removeEventListener("load", run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, namesKey, ...deps]);
  return warnings;
}
