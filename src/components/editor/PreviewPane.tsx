"use client";
import { useEffect, useMemo, useRef } from "react";
import { Badge, cx } from "@/components/ui";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import { FORMAT_IDS, FORMATS, type FormatId } from "@/domain/formats";
import type { LayoutResult, LayoutWarning } from "@/templates/contract";
import { PieceRenderer, ScaledPreview, useOverflowCheck, type TemplateRef } from "@/render/PieceRenderer";

const SHORT: Record<FormatId, string> = {
  encarte_a4: "Encarte A4", post_quadrado: "Post 1:1", post_feed: "Post feed", story: "Story", cartaz_a4: "Cartaz A4",
  cartaz_a3: "Cartaz A3", etiqueta_a4: "Etiquetas", banner_vitrine: "Banner", tv_horizontal: "TV",
};

export function FormatTabs({ value, onChange, warnings, disabledFormats }: { value: FormatId; onChange: (f: FormatId) => void; warnings: Partial<Record<FormatId, number>>; disabledFormats: FormatId[] }) {
  return (
    <div role="tablist" aria-label="Formatos" className="flex gap-1 overflow-x-auto pb-1">
      {FORMAT_IDS.map((f) => (
        <button key={f} role="tab" aria-selected={value === f} onClick={() => onChange(f)} title={FORMATS[f].label}
          className={cx("flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold", value === f ? "bg-ink text-white" : "bg-surface text-ink-muted hover:text-ink",
            disabledFormats.includes(f) && "line-through opacity-60")}>
          {SHORT[f]}
          {!!warnings[f] && <span className="rounded-full bg-warning px-1.5 text-[11px] text-ink" aria-label={`${warnings[f]} avisos`}>{warnings[f]}</span>}
        </button>
      ))}
    </div>
  );
}

export function PreviewPane({ campaign, template, format, overrides, layout, pageIndex, onPageChange, onOverflow, names, height }: {
  campaign: RenderCampaign; template: TemplateRef; format: FormatId; overrides: PieceOverrides; layout: LayoutResult | null;
  pageIndex: number; onPageChange: (p: number) => void; onOverflow: (w: LayoutWarning[]) => void; names: Record<string, string>; height: string;
}) {
  const f = FORMATS[format];
  const total = layout?.pages.length ?? 1;
  const page = Math.min(pageIndex, Math.max(0, total - 1));
  const ref = useRef<HTMLDivElement>(null);
  const depKey = useMemo(() => JSON.stringify([campaign.items.map((i) => [i.id, i.name, i.offer, i.imageUrl, i.imageFit, i.highlight]), campaign.title, campaign.subtitle, overrides, format, page]), [campaign, overrides, format, page]);
  const overflow = useOverflowCheck(ref, [depKey], names);
  useEffect(() => { onOverflow(overflow); }, [overflow, onOverflow]);
  useEffect(() => { if (pageIndex !== page) onPageChange(page); }, [page, pageIndex, onPageChange]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate text-ink-muted">{f.label}{f.physical && ` · ${f.physical.widthMm}×${f.physical.heightMm} mm`}</span>
        {total > 1 && (
          <nav aria-label="Páginas" className="flex shrink-0 items-center gap-1">
            <button className="rounded-lg border border-line bg-surface px-2 py-1 font-semibold disabled:opacity-40" disabled={page === 0} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">‹</button>
            <span className="px-1 tabular-nums" aria-live="polite">Página {page + 1} de {total}</span>
            <button className="rounded-lg border border-line bg-surface px-2 py-1 font-semibold disabled:opacity-40" disabled={page >= total - 1} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">›</button>
          </nav>
        )}
        {overflow.length > 0 && <Badge tone="warning">{overflow.length} problema(s) de encaixe</Badge>}
      </div>
      <div className="min-h-0 flex-1 rounded-2xl bg-ink/5 p-2 sm:p-4" style={height === "100%" ? undefined : { height, flex: "none" }}>
        <div className="h-full">
        <ScaledPreview width={f.widthPx} height={f.heightPx} fit="contain" contentRef={ref}
          label={`Prévia: ${f.label}, página ${page + 1} de ${total}`} style={{ height: "100%" }}>
          <PieceRenderer campaign={campaign} template={template} format={f} overrides={overrides} layout={layout ?? undefined} pageIndex={page} />
        </ScaledPreview>
        </div>
      </div>
    </div>
  );
}
