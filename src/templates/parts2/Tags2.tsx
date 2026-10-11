// Etiquetas de gôndola (v2): 8 × 95×65 mm por A4, faixa com o fundo do tema, nome forte,
// placa de preço grande e validade. Marcas de corte nas margens alinhadas a todas as linhas de corte.
import type { ReactElement } from "react";
import type { LayoutCell } from "../contract";
import { mmToPx } from "@/domain/formats";
import { ensureContrast } from "../parts/color";
import { clamp, fitWidth, fontStack, r1 } from "./measure";
import { GroundFill } from "./grounds";
import { nameBlock2 } from "./Card2";
import { planPrice } from "./PricePlate";
import type { Ctx2 } from "./look";

export function CropMarks2({ cells, w, h }: { cells: LayoutCell[]; w: number; h: number }) {
  if (!cells.length) return null;
  const xs = [...new Set(cells.flatMap((c) => [r1(c.rect.x), r1(c.rect.x + c.rect.w)]))];
  const ys = [...new Set(cells.flatMap((c) => [r1(c.rect.y), r1(c.rect.y + c.rect.h)]))];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const gap = mmToPx(2);
  const len = (room: number) => Math.max(0, Math.min(mmToPx(6), room - gap - 2));
  const lt = len(minY), lb = len(h - maxY), ll = len(minX), lr = len(w - maxX);
  return (
    <svg data-ev-cropmarks="" width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }} aria-hidden="true">
      <g stroke="#000" strokeWidth={0.6}>
        {xs.map((x) => <g key={`x${x}`}>{lt > 0 && <line x1={x} x2={x} y1={minY - gap - lt} y2={minY - gap} />}{lb > 0 && <line x1={x} x2={x} y1={maxY + gap} y2={maxY + gap + lb} />}</g>)}
        {ys.map((y) => <g key={`y${y}`}>{ll > 0 && <line x1={minX - gap - ll} x2={minX - gap} y1={y} y2={y} />}{lr > 0 && <line x1={maxX + gap} x2={maxX + gap + lr} y1={y} y2={y} />}</g>)}
      </g>
    </svg>
  );
}

function Label({ cell, ctx }: { cell: LayoutCell; ctx: Ctx2 }): ReactElement {
  const { look, campaign } = ctx;
  const { item } = cell;
  const { x, y, w, h } = cell.rect;
  const pad = r1(Math.min(w, h) * 0.05);
  const bandH = r1(h * 0.17);
  const footH = r1(h * 0.085);
  const bg = "#ffffff";
  const g = look.header.ground;
  const bandFg = ensureContrast("#ffffff", g.base, 4.5);
  const lf = look.fonts.label;
  const label = look.tag.label.toLocaleUpperCase("pt-BR");
  const labelFs = fitWidth(label, lf, w * 0.42, bandH * 0.6, 6);
  const storeFs = fitWidth(campaign.brand.storeName, { family: "Inter", weight: 800 }, w * 0.48, bandH * 0.4, 6);
  const fg = ensureContrast(look.card.fg, bg, 7);
  const meta = ensureContrast(look.card.meta, bg, 4.5);
  const nb = nameBlock2(item, look, w - pad * 2, (h - bandH - footH) * 0.34, { maxFs: h * 0.09 * ctx.fontScale, minFs: 7, maxLines: 2, align: "left", color: fg, meta });
  const top = bandH + pad * 0.5 + nb.height + pad * 0.3;
  const plan = planPrice(item.offer, item.unit, look, w - pad * 2, h - footH - pad * 0.2 - top, { scale: ctx.fontScale, align: "right", maxExtras: 1, onBg: bg, onFg: fg });
  const valFs = fitWidth(campaign.validityText, { family: "Inter", weight: 700 }, w - pad * 2, footH * 0.6, 5.5);
  return (
    <div data-ev-cell={item.id} data-ev-size="tag" aria-label={item.name} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: bg, overflow: "hidden", outline: "0.5px solid rgba(0,0,0,0.15)", outlineOffset: -0.5 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: r1(w), height: bandH, overflow: "hidden", clipPath: `polygon(0 0, 100% 0, 100% 78%, 0 100%)` }}><GroundFill g={g} w={w} h={bandH} seed={3} /></div>
      <div style={{ position: "absolute", left: pad, top: 0, height: r1(bandH * 0.86), display: "flex", alignItems: "center", fontFamily: fontStack(lf.family), fontWeight: lf.weight, fontStyle: lf.italic ? "italic" : undefined, fontSize: labelFs, color: bandFg, lineHeight: 1, whiteSpace: "nowrap", textShadow: "0 2px 0 rgba(0,0,0,.45)" }}>{label}</div>
      <div style={{ position: "absolute", right: pad, top: 0, height: r1(bandH * 0.8), display: "flex", alignItems: "center", fontFamily: fontStack("Inter"), fontWeight: 800, fontSize: storeFs, color: bandFg, whiteSpace: "nowrap", maxWidth: r1(w * 0.5) }}>{campaign.brand.storeName}</div>
      {nb.render(pad, bandH + pad * 0.5)}
      {plan.render(pad, h - footH - pad * 0.2 - plan.h)}
      <div style={{ position: "absolute", left: pad, top: r1(h - footH), width: r1(w - pad * 2), height: footH, display: "flex", alignItems: "center", fontFamily: fontStack("Inter"), fontWeight: 700, fontSize: valFs, color: ensureContrast("#444444", bg, 7), whiteSpace: "nowrap", overflow: "hidden" }}>{campaign.validityText}</div>
    </div>
  );
}

export function TagSheet2({ ctx }: { ctx: Ctx2 }) {
  const { page, format } = ctx;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "#ffffff" }} />
      <CropMarks2 cells={page.cells} w={format.widthPx} h={format.heightPx} />
      {page.cells.map((c) => <Label key={c.item.id} cell={c} ctx={ctx} />)}
      {page.totalPages > 1 && (
        <div style={{ position: "absolute", right: format.safeAreaPx, bottom: r1(clamp(format.safeAreaPx * 0.4, 4, 20)), fontFamily: fontStack("Inter"), fontSize: 9, color: "#444" }}>
          Folha {page.pageIndex + 1}/{page.totalPages}
        </div>
      )}
    </>
  );
}
