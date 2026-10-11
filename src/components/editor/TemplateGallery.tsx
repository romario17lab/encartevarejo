"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Badge, cx, EmptyState, ErrorState, Select } from "@/components/ui";
import { LoadingBlock } from "@/components/app/common";
import { demoCampaign } from "@/components/app/demo";
import { FORMATS, type FormatId } from "@/domain/formats";
import type { RenderBrand } from "@/domain/campaign";
import { PieceRenderer, ScaledPreview } from "@/render/PieceRenderer";
import { asList, type TemplateMeta } from "@/lib/client/api";
import { SEGMENT_LABEL, STYLE_LABEL } from "@/lib/client/format";
import { useApi } from "@/lib/client/hooks";

export function useTemplates() {
  const q = useApi<unknown>("/api/templates");
  return { ...q, list: asList<TemplateMeta>(q.data, "templates") };
}

/** Renderiza a miniatura só quando entra na tela (galerias com muitos modelos). */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setSeen(true); }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

export const TemplateThumb = memo(function TemplateThumb({ t, brand, format }: { t: TemplateMeta; brand?: Partial<RenderBrand>; format?: FormatId }) {
  const f = FORMATS[format ?? t.thumbnailFormat ?? "post_feed"] ?? FORMATS.post_feed;
  const { ref, seen } = useInView<HTMLDivElement>();
  const campaign = useMemo(() => demoCampaign(Math.min(6, f.maxItemsPerPage), brand), [f.maxItemsPerPage, brand]);
  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-line bg-surface-alt" style={{ aspectRatio: `${f.widthPx} / ${f.heightPx}` }}>
      {seen && (
        <ScaledPreview width={f.widthPx} height={f.heightPx} label={`Miniatura do modelo ${t.name} (dados de demonstração)`}>
          <PieceRenderer campaign={campaign} template={{ id: t.id, version: t.version }} format={f} />
        </ScaledPreview>
      )}
    </div>
  );
});

export function TemplateGallery({ value, onSelect, segmentDefault = "", brand, currentId }: {
  value: string | null; onSelect: (t: TemplateMeta) => void; segmentDefault?: string; brand?: Partial<RenderBrand>; currentId?: string;
}) {
  const q = useTemplates();
  const [segment, setSegment] = useState(segmentDefault);
  const [style, setStyle] = useState("");
  const all = q.list;
  const segs = [...new Set(all.flatMap((t) => t.segments ?? []))];
  const styles = [...new Set(all.map((t) => t.style).filter(Boolean) as string[])];
  const filtered = all.filter((t) => (!segment || t.segments?.includes(segment)) && (!style || t.style === style));
  const shown = filtered.length || !segment ? filtered : all; // segmento sem modelos → mostra todos

  if (q.loading) return <LoadingBlock label="Carregando modelos…" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!all.length) return <EmptyState title="Nenhum modelo publicado" description="A administração ainda não publicou modelos. Tente novamente mais tarde." />;
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:max-w-md">
        <Select label="Segmento" value={segment} onChange={(e) => setSegment(e.target.value)} options={[{ value: "", label: "Todos" }, ...segs.map((s) => ({ value: s, label: SEGMENT_LABEL[s] ?? s }))]} />
        <Select label="Estilo" value={style} onChange={(e) => setStyle(e.target.value)} options={[{ value: "", label: "Todos" }, ...styles.map((s) => ({ value: s, label: STYLE_LABEL[s] ?? s }))]} />
      </div>
      {segment && !filtered.length && <p className="mb-2 text-sm text-ink-muted">Nenhum modelo específico para esse segmento. Mostrando todos.</p>}
      <div role="radiogroup" aria-label="Modelos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((t) => (
          <button type="button" role="radio" aria-checked={value === t.id} key={t.id} onClick={() => onSelect(t)}
            className={cx("flex flex-col gap-2 rounded-2xl border-2 bg-surface p-2 text-left transition", value === t.id ? "border-brand ring-2 ring-brand/30" : "border-transparent hover:border-line")}>
            <TemplateThumb t={t} brand={brand} />
            <span className="px-1">
              <span className="block text-sm font-bold leading-tight">{t.name}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {t.style && <Badge>{STYLE_LABEL[t.style] ?? t.style}</Badge>}
                {currentId === t.id && <Badge tone="brand">atual</Badge>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
