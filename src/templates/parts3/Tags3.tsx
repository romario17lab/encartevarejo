// Etiquetas de gôndola (v3): 8 × 95×65 mm por A4, faixa com o fundo em camadas do tema, nome forte,
// etiqueta de preço no formato do modelo (as redondas viram a "prima" larga quando não cabem) e validade.
import type { ReactElement } from "react";
import type { LayoutCell } from "../contract";
import { ensureContrast } from "../parts/color";
import { CropMarks2 } from "../parts2/Tags2";
import { clamp, fitWidth, fontStack, r1 } from "../parts2/measure";
import { Layers3 } from "./layers";
import { nameBlock3 } from "./Card3";
import { planPrice3 } from "./PriceTag3";
import type { Ctx3 } from "./look3";

function Label3({ cell, ctx }: { cell: LayoutCell; ctx: Ctx3 }): ReactElement {
  const { look, campaign } = ctx;
  const { item } = cell;
  const { x, y, w, h } = cell.rect;
  const pad = r1(Math.min(w, h) * 0.05);
  const bandH = r1(h * 0.17);
  const footH = r1(h * 0.085);
  const bg = "#ffffff";
  const g = look.header.ground ?? look.page;
  const bandFg = ensureContrast("#ffffff", g.base, 4.5);
  const lf = look.fonts.label;
  const label = look.tag.label.toLocaleUpperCase("pt-BR");
  const labelFs = fitWidth(label, lf, w * 0.42, bandH * 0.6, 6);
  const storeFs = fitWidth(campaign.brand.storeName, { family: "Inter", weight: 800 }, w * 0.48, bandH * 0.4, 6);
  const fg = ensureContrast(look.card.fg, bg, 7);
  const meta = ensureContrast(look.card.meta, bg, 4.5);
  const nb = nameBlock3(item, look, w - pad * 2, (h - bandH - footH) * 0.34, { maxFs: h * 0.09 * ctx.fontScale, minFs: 7, maxLines: 2, align: "left", color: fg, meta });
  const top = bandH + pad * 0.5 + nb.height + pad * 0.3;
  const plan = planPrice3(item.offer, item.unit, look, w - pad * 2, h - footH - pad * 0.2 - top, { scale: ctx.fontScale, align: "right", maxExtras: 1, onBg: bg, onFg: fg });
  const valFs = fitWidth(campaign.validityText, { family: "Inter", weight: 700 }, w - pad * 2, footH * 0.6, 5.5);
  return (
    <div data-ev-cell={item.id} data-ev-size="tag" aria-label={item.name} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: bg, overflow: "hidden", outline: "0.5px solid rgba(0,0,0,0.15)", outlineOffset: -0.5 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: r1(w), height: bandH, overflow: "hidden", clipPath: `polygon(0 0, 100% 0, 100% 74%, 0 100%)` }}><Layers3 g={{ ...g, intensity: g.intensity * 0.8 }} w={w} h={bandH} word={label} seed={3} /></div>
      <div style={{ position: "absolute", left: pad, top: 0, height: r1(bandH * 0.84), display: "flex", alignItems: "center", fontFamily: fontStack(lf.family), fontWeight: lf.weight, fontStyle: lf.italic ? "italic" : undefined, fontSize: labelFs, color: bandFg, lineHeight: 1, whiteSpace: "nowrap", textShadow: "1px 2px 0 rgba(0,0,0,.5)" }}>{label}</div>
      <div style={{ position: "absolute", right: pad, top: 0, height: r1(bandH * 0.78), display: "flex", alignItems: "center", fontFamily: fontStack("Inter"), fontWeight: 800, fontSize: storeFs, color: bandFg, whiteSpace: "nowrap", maxWidth: r1(w * 0.5), textShadow: "1px 1px 0 rgba(0,0,0,.45)" }}>{campaign.brand.storeName}</div>
      {nb.render(pad, bandH + pad * 0.5)}
      {plan.render(pad, h - footH - pad * 0.2 - plan.h)}
      <div style={{ position: "absolute", left: pad, top: r1(h - footH), width: r1(w - pad * 2), height: footH, display: "flex", alignItems: "center", fontFamily: fontStack("Inter"), fontWeight: 700, fontSize: valFs, color: ensureContrast("#444444", bg, 7), whiteSpace: "nowrap", overflow: "hidden" }}>{campaign.validityText}</div>
    </div>
  );
}

export function TagSheet3({ ctx }: { ctx: Ctx3 }) {
  const { page, format } = ctx;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "#ffffff" }} />
      <CropMarks2 cells={page.cells} w={format.widthPx} h={format.heightPx} />
      {page.cells.map((c) => <Label3 key={c.item.id} cell={c} ctx={ctx} />)}
      {page.totalPages > 1 && (
        <div style={{ position: "absolute", right: format.safeAreaPx, bottom: r1(clamp(format.safeAreaPx * 0.4, 4, 20)), fontFamily: fontStack("Inter"), fontSize: 9, color: "#444" }}>
          Folha {page.pageIndex + 1}/{page.totalPages}
        </div>
      )}
    </>
  );
}
