"use client";
import { Input, Select } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import type { CampaignItem, PieceOverrides } from "@/domain/campaign";
import { FORMATS, type FormatId } from "@/domain/formats";
import type { BrandColors, Piece } from "@/lib/client/api";

const COLOR_LABEL: Record<keyof BrandColors, string> = { primary: "Principal", secondary: "Secundária", accent: "Destaque", text: "Texto", background: "Fundo" };

/** Opções por formato: densidade, itens ocultos, títulos, cores e escala de fonte. Nunca preços. */
export function PiecePanel({ format, piece, items, baseColors, onChange, readOnly, supported }: {
  format: FormatId; piece: Piece; items: CampaignItem[]; baseColors: BrandColors; onChange: (p: Partial<Piece>, key?: string) => void; readOnly?: boolean; supported: boolean;
}) {
  const f = FORMATS[format];
  const o = piece.overrides;
  const setO = (patch: Partial<PieceOverrides>, key?: string) => onChange({ overrides: { ...o, ...patch } }, key ? `${format}.${key}` : undefined);
  const hidden = o.hiddenItemIds ?? [];
  const perPageOptions = [{ value: "auto", label: "Automático" }, ...Array.from({ length: f.maxItemsPerPage - f.minItemsPerPage + 1 }, (_, i) => {
    const n = f.minItemsPerPage + i; return { value: String(n), label: `${n} por ${f.kind === "tags" ? "folha" : "página"}` };
  })];

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      <legend className="sr-only">Opções do formato {f.label}</legend>
      <p className="text-sm text-ink-muted">Ajustes que valem só para <strong className="text-ink">{f.label}</strong>.</p>
      {!supported && <p role="alert" className="rounded-xl bg-warning/10 p-3 text-sm">O modelo atual não tem versão para este formato. Troque o modelo para gerar esta peça.</p>}
      <Checkbox label="Gerar esta peça" description="Desmarcado: o formato fica fora do pacote de exportação." checked={piece.enabled} onChange={(v) => onChange({ enabled: v })} />
      {f.kind !== "single" && (
        <Select label={f.kind === "tags" ? "Etiquetas por folha" : "Produtos por página"} value={o.itemsPerPage == null ? "auto" : String(o.itemsPerPage)}
          onChange={(e) => setO({ itemsPerPage: e.target.value === "auto" ? "auto" : Number(e.target.value) })} options={perPageOptions}
          hint={`Este formato aceita de ${f.minItemsPerPage} a ${f.maxItemsPerPage}. Mais produtos geram mais páginas.`} />
      )}
      {f.kind !== "tags" && <>
        <Input label="Título nesta peça" value={o.title ?? ""} maxLength={60} placeholder="Usa o título da campanha" onChange={(e) => setO({ title: e.target.value || undefined }, "title")} />
        <Input label="Subtítulo nesta peça" value={o.subtitle ?? ""} maxLength={80} placeholder="Usa o subtítulo da campanha" onChange={(e) => setO({ subtitle: e.target.value || undefined }, "subtitle")} />
      </>}
      <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-sm">
        <span className="font-medium">Tamanho do texto</span>
        <span className="tabular-nums text-ink-muted">{Math.round((o.fontScale ?? 1) * 100)}%</span>
        <input type="range" min={0.8} max={1.3} step={0.05} value={o.fontScale ?? 1} onChange={(e) => setO({ fontScale: Number(e.target.value) === 1 ? undefined : Number(e.target.value) }, "font")} className="col-span-2 h-8 accent-[rgb(var(--ev-brand))]" />
      </label>

      <details className="rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold">Cores desta peça</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(Object.keys(COLOR_LABEL) as Array<keyof BrandColors>).map((k) => {
            const v = o.colors?.[k];
            return (
              <div key={k} className="flex flex-col gap-1">
                <label htmlFor={`pc-${format}-${k}`} className="text-xs font-medium">{COLOR_LABEL[k]}</label>
                <div className="flex items-center gap-2">
                  <input id={`pc-${format}-${k}`} type="color" value={v ?? baseColors[k] ?? "#000000"} onChange={(e) => setO({ colors: { ...o.colors, [k]: e.target.value.toUpperCase() } }, `color.${k}`)} className="h-9 w-9 cursor-pointer rounded-md border border-line" />
                  {v ? <button type="button" className="text-xs font-semibold text-brand underline" onClick={() => { const c = { ...o.colors }; delete c[k]; setO({ colors: Object.keys(c).length ? c : undefined }); }}>Padrão</button> : <span className="text-xs text-ink-muted">padrão</span>}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      <details className="rounded-xl border border-line px-3 py-2" open={hidden.length > 0}>
        <summary className="cursor-pointer text-sm font-semibold">Produtos neste formato {hidden.length > 0 && `(${hidden.length} ocultos)`}</summary>
        <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-auto">
          {items.map((it) => (
            <li key={it.id}>
              <Checkbox label={it.name} checked={!hidden.includes(it.id)}
                onChange={(show) => setO({ hiddenItemIds: show ? hidden.filter((x) => x !== it.id) : [...hidden, it.id] })} />
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  );
}
