// Folha de etiquetas de gôndola (etiqueta_a4): 8 etiquetas de 95×65 mm por A4 nas posições
// calculadas pelo motor de layout, com marcas de corte nas margens.
import type { LayoutCell } from "../contract";
import { mmToPx } from "@/domain/formats";
import { PriceTag } from "./PriceTag";
import { nameBlock } from "./ProductCard";
import { fontStack } from "./metrics";
import { fitOneLine, round } from "./text";
import { ensureContrast } from "./color";
import type { RenderCtx } from "./types";

export function PriceLabel({ cell, ctx }: { cell: LayoutCell; ctx: RenderCtx }) {
  const { skin, campaign } = ctx;
  const { item } = cell;
  const { x, y, w, h } = cell.rect;
  const t = skin.tag;
  const pad = round(Math.min(w, h) * 0.05);
  const bandH = round(h * 0.16);
  const footH = round(h * 0.1);
  const bandFg = ensureContrast(t.bandFg, t.bandBg, 4.5);
  const fg = ensureContrast(t.fg, t.bg, 4.5);
  const df = skin.fonts.display;
  const labelFs = fitOneLine(t.label, w * 0.4, bandH * 0.62, { family: df.family, upper: true, minFs: 7 });
  const storeFs = fitOneLine(campaign.brand.storeName, w * 0.5, bandH * 0.42, { family: skin.fonts.body.family, minFs: 6 });
  const valFs = fitOneLine(campaign.validityText, w - pad * 2, footH * 0.62, { family: skin.fonts.body.family, minFs: 6 });
  const nameH = round((h - bandH - footH) * 0.36);
  const nb = nameBlock(item, w - pad * 2, nameH, { ...skin, card: { ...skin.card, bg: t.bg } }, { maxFs: h * 0.085, minFs: 7, maxLines: 2, align: "left", color: fg, metaColor: ensureContrast(skin.card.meta, t.bg, 4.5) });
  const priceY = bandH + pad * 0.4 + nb.height + pad * 0.3;
  const priceH = h - footH - pad * 0.3 - priceY;
  // etiqueta usa forma "band"/"plain" para máxima área útil
  const shape = skin.price.shape === "plain" ? "plain" : "band";
  return (
    <div data-ev-cell={item.id} data-ev-size="tag" aria-label={item.name} style={{ position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), background: t.bg, overflow: "hidden", outline: "0.5px solid rgba(0,0,0,0.12)", outlineOffset: -0.5 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: round(w), height: bandH, background: t.bandBg, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${pad}px`, color: bandFg }}>
        <span style={{ fontFamily: fontStack(df.family), fontWeight: df.weight, fontSize: labelFs, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1 }}>{t.label}</span>
        <span style={{ fontFamily: fontStack(skin.fonts.body.family), fontWeight: 700, fontSize: storeFs, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", maxWidth: "55%" }}>{campaign.brand.storeName}</span>
      </div>
      {nb.render(bandH + pad * 0.4, pad)}
      <PriceTag offer={item.offer} unit={item.unit} x={pad} y={priceY} w={w - pad * 2} h={priceH} skin={skin} shape={shape} align="right" fontScale={ctx.fontScale} maxExtras={1} />
      <div style={{ position: "absolute", left: pad, top: h - footH, width: w - pad * 2, height: footH, display: "flex", alignItems: "center", fontFamily: fontStack(skin.fonts.body.family), fontSize: valFs, color: ensureContrast("#555555", t.bg, 4.5), whiteSpace: "nowrap", overflow: "hidden" }}>{campaign.validityText}</div>
    </div>
  );
}

/** Marcas de corte nas margens, alinhadas a todas as linhas de corte das etiquetas. */
export function CropMarks({ cells, w, h }: { cells: LayoutCell[]; w: number; h: number }) {
  if (!cells.length) return null;
  const xs = [...new Set(cells.flatMap((c) => [round(c.rect.x), round(c.rect.x + c.rect.w)]))];
  const ys = [...new Set(cells.flatMap((c) => [round(c.rect.y), round(c.rect.y + c.rect.h)]))];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const gap = mmToPx(2);
  const lenTop = Math.max(0, Math.min(mmToPx(6), minY - gap - 2));
  const lenBottom = Math.max(0, Math.min(mmToPx(6), h - maxY - gap - 2));
  const lenLeft = Math.max(0, Math.min(mmToPx(6), minX - gap - 2));
  const lenRight = Math.max(0, Math.min(mmToPx(6), w - maxX - gap - 2));
  const stroke = { stroke: "#000", strokeWidth: 0.6 };
  return (
    <svg data-ev-cropmarks="" width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
      {xs.map((x) => (
        <g key={`x${x}`} {...stroke}>
          {lenTop > 0 && <line x1={x} x2={x} y1={minY - gap - lenTop} y2={minY - gap} />}
          {lenBottom > 0 && <line x1={x} x2={x} y1={maxY + gap} y2={maxY + gap + lenBottom} />}
        </g>
      ))}
      {ys.map((y) => (
        <g key={`y${y}`} {...stroke}>
          {lenLeft > 0 && <line x1={minX - gap - lenLeft} x2={minX - gap} y1={y} y2={y} />}
          {lenRight > 0 && <line x1={maxX + gap} x2={maxX + gap + lenRight} y1={y} y2={y} />}
        </g>
      ))}
    </svg>
  );
}

export function TagSheet({ ctx }: { ctx: RenderCtx }) {
  const { page, format } = ctx;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "#ffffff" }} />
      <CropMarks cells={page.cells} w={format.widthPx} h={format.heightPx} />
      {page.cells.map((c) => <PriceLabel key={c.item.id} cell={c} ctx={ctx} />)}
      {page.totalPages > 1 && (
        <div style={{ position: "absolute", right: format.safeAreaPx, bottom: Math.max(4, format.safeAreaPx * 0.4), fontFamily: fontStack("Inter"), fontSize: 9, color: "#555" }}>
          Folha {page.pageIndex + 1}/{page.totalPages}
        </div>
      )}
    </>
  );
}
