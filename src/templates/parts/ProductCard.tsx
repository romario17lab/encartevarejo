// Card de produto compartilhado. Desenha DENTRO do retângulo calculado pelo motor de layout.
// Foto sempre proporcional (object-fit: contain + enquadramento x/y/zoom), nome com ajuste por
// tamanho e corte em 2–3 linhas, linha de marca/gramatura e a etiqueta de preço.
import type { CSSProperties, ReactElement } from "react";
import type { LayoutCell } from "../contract";
import { DiscountBadge, PriceTag, priceModel } from "./PriceTag";
import { fontStack } from "./metrics";
import { clamp, fitOneLine, fitText, round } from "./text";
import { ensureContrast } from "./color";
import { NoPhotoGlyph } from "./glyphs";
import type { RenderCtx, Skin } from "./types";
import type { RenderItem } from "@/domain/campaign";

export function ProductPhoto({ item, x, y, w, h, bg, radius, label = true }: { item: RenderItem; x: number; y: number; w: number; h: number; bg: string; radius: number; label?: boolean }) {
  const fit = item.imageFit ?? { x: 50, y: 50, zoom: 1 };
  const box: CSSProperties = { position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), overflow: "hidden", background: bg, borderRadius: round(radius) };
  if (!item.imageUrl) {
    const g = Math.min(w, h);
    const muted = ensureContrast("#6b7280", bg, 3);
    return (
      <div data-ev-photo="vazio" style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: g * 0.04 }}>
        <NoPhotoGlyph size={round(clamp(g * 0.3, 10, 160))} color={muted} />
        {label && g > 40 && <span style={{ fontFamily: fontStack("Inter"), fontSize: round(clamp(g * 0.09, 7, 30)), fontWeight: 600, color: muted, letterSpacing: "0.04em" }}>sem foto</span>}
      </div>
    );
  }
  return (
    <div data-ev-photo="" style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.name} draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: `${fit.x}% ${fit.y}%`, transform: fit.zoom && fit.zoom !== 1 ? `scale(${fit.zoom})` : undefined, transformOrigin: `${fit.x}% ${fit.y}%`, display: "block" }} />
    </div>
  );
}

/** Nome + linha de marca/gramatura dentro de uma caixa. Retorna a altura efetivamente usada. */
export function nameBlock(item: RenderItem, w: number, maxH: number, skin: Skin, opts: { maxFs: number; minFs: number; maxLines: number; align: "left" | "center"; color: string; metaColor: string }) {
  const nf = skin.fonts.name;
  const meta = [item.brand, item.sizeLabel].filter(Boolean).join(" · ");
  const metaFs = meta ? fitOneLine(meta, w, Math.max(opts.minFs * 0.9, opts.maxFs * 0.62), { family: skin.fonts.body.family, minFs: Math.max(6, opts.minFs * 0.8) }) : 0;
  const metaH = meta ? metaFs * 1.25 : 0;
  const lh = nf.upper ? 1.05 : 1.12;
  const fit = fitText(item.name, w, Math.max(4, maxH - metaH), { family: nf.family, upper: nf.upper, maxFs: opts.maxFs, minFs: opts.minFs, maxLines: opts.maxLines, lineHeight: lh, letterSpacing: nf.letterSpacing });
  const nameH = fit.lines * fit.fontSize * lh;
  const el = (y: number, x: number): ReactElement => (
    <div style={{ position: "absolute", left: round(x), top: round(y), width: round(w) }}>
      <div lang="pt-BR" data-ev-name="" title={item.name}
        style={{ fontFamily: fontStack(nf.family), fontWeight: nf.weight, fontStyle: nf.italic ? "italic" : undefined, textTransform: nf.upper ? "uppercase" : undefined, letterSpacing: nf.letterSpacing ? `${nf.letterSpacing}em` : undefined,
          fontSize: fit.fontSize, lineHeight: lh, color: opts.color, textAlign: opts.align, maxHeight: round(nameH + 1), overflow: "hidden", display: "-webkit-box", WebkitLineClamp: fit.lines, WebkitBoxOrient: "vertical", hyphens: "auto", overflowWrap: "break-word" }}>
        {item.name}
      </div>
      {meta && (
        <div style={{ fontFamily: fontStack(skin.fonts.body.family), fontWeight: 500, fontSize: metaFs, lineHeight: 1.25, color: opts.metaColor, textAlign: opts.align, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
      )}
    </div>
  );
  return { height: nameH + metaH, render: el, truncated: fit.truncated };
}

export function ProductCard({ cell, ctx }: { cell: LayoutCell; ctx: RenderCtx }) {
  const { skin, format } = ctx;
  const { item, size } = cell;
  const { x, y, w, h } = cell.rect;
  const S = Math.min(w, h);
  const isHero = size === "hero";
  const single = format.kind === "single";
  const pad = round(clamp(S * (single ? 0.04 : 0.055), 4, 40));
  const radius = round(S * skin.card.radius);
  const cardBg = isHero && skin.card.heroBg ? skin.card.heroBg : skin.card.bg;
  const cardFg = ensureContrast(isHero && skin.card.heroFg ? skin.card.heroFg : skin.card.fg, cardBg, 4.5);
  const metaFg = ensureContrast(skin.card.meta, cardBg, 4.5);
  const photoBg = skin.card.photoBg;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const fs = ctx.fontScale;
  const model = priceModel(item.offer, item.unit);
  const badgeSize = round(clamp(S * (isHero ? 0.22 : 0.2), 22, 150));
  const elements: ReactElement[] = [];
  const nameMax = clamp(S * (single ? 0.1 : isHero ? 0.085 : 0.078), 9, single ? 96 : 64) * fs;
  const nameMin = clamp(S * 0.055, 8, 30);
  const align = single ? "center" : skin.card.nameAlign;

  const wide = !single && w / h >= 1.3;
  let composition = single ? "poster" : wide ? "side" : skin.card.composition;
  // cards muito baixos não comportam a sobreposição
  if (composition === "overlay" && h < 120) composition = "stack";

  if (composition === "side") {
    const photoW = round(iw * 0.42);
    const colX = pad + photoW + pad * 0.8;
    const colW = w - colX - pad;
    const priceH = round(ih * 0.56);
    const nb = nameBlock(item, colW, ih - priceH - pad * 0.4, skin, { maxFs: nameMax, minFs: nameMin, maxLines: 3, align: "left", color: cardFg, metaColor: metaFg });
    elements.push(<ProductPhoto key="ph" item={item} x={pad} y={pad} w={photoW} h={ih} bg={photoBg} radius={radius * 0.6} />);
    elements.push(<div key="nm">{nb.render(pad, colX)}</div>);
    elements.push(<PriceTag key="pr" offer={item.offer} unit={item.unit} x={colX} y={h - pad - priceH} w={colW} h={priceH} skin={skin} fontScale={fs} align={skin.price.shape === "plain" ? "left" : skin.price.align} />);
    if (model.discount > 0) elements.push(<DiscountBadge key="bd" pct={model.discount} x={pad + photoW} y={pad} size={badgeSize * 0.9} skin={skin} />);
  } else if (composition === "poster") {
    // cartaz: nome grande no topo, foto ao centro, preço gigante embaixo
    const nb = nameBlock(item, iw, ih * 0.24, skin, { maxFs: nameMax, minFs: nameMin, maxLines: 3, align: "center", color: cardFg, metaColor: metaFg });
    const priceH = round(ih * 0.42);
    const photoY = pad + nb.height + pad * 0.5;
    const photoH = h - pad - priceH - pad * 0.5 - photoY;
    elements.push(<div key="nm">{nb.render(pad, pad)}</div>);
    elements.push(<ProductPhoto key="ph" item={item} x={pad + iw * 0.1} y={photoY} w={iw * 0.8} h={photoH} bg={photoBg} radius={radius * 0.5} />);
    elements.push(<PriceTag key="pr" offer={item.offer} unit={item.unit} x={pad} y={h - pad - priceH} w={iw} h={priceH} skin={skin} fontScale={fs} align="center" maxExtras={3} />);
    if (model.discount > 0) elements.push(<DiscountBadge key="bd" pct={model.discount} x={w - pad} y={photoY} size={round(S * 0.2)} skin={skin} />);
  } else if (composition === "overlay") {
    // nome no topo, foto à esquerda e preço no canto inferior direito, sobrepondo no máximo ~12% da foto
    const nb = nameBlock(item, iw, ih * 0.26, skin, { maxFs: nameMax, minFs: nameMin, maxLines: 2, align: "left", color: cardFg, metaColor: metaFg });
    const top = pad + nb.height + pad * 0.4;
    const restH = h - pad - top;
    const photoW = iw * 0.62;
    const priceW = round(iw * 0.5);
    const priceH = round(Math.min(restH * 0.6, ih * 0.46));
    elements.push(<div key="nm">{nb.render(pad, pad)}</div>);
    elements.push(<ProductPhoto key="ph" item={item} x={pad} y={top} w={photoW} h={restH} bg={photoBg} radius={radius * 0.6} />);
    elements.push(<PriceTag key="pr" offer={item.offer} unit={item.unit} x={w - pad - priceW} y={h - pad - priceH} w={priceW} h={priceH} skin={skin} fontScale={fs} />);
    if (model.discount > 0) elements.push(<DiscountBadge key="bd" pct={model.discount} x={w - pad} y={top} size={badgeSize} skin={skin} />);
  } else {
    // stack (foto → nome → preço) ou top-name (nome → foto → preço)
    const priceH = round(ih * (size === "compact" ? 0.37 : 0.35));
    const nb = nameBlock(item, iw, ih * 0.22, skin, { maxFs: nameMax, minFs: nameMin, maxLines: size === "compact" ? 2 : 3, align, color: cardFg, metaColor: metaFg });
    const gap = pad * 0.4;
    const photoH = ih - priceH - nb.height - gap * 2;
    if (composition === "top-name") {
      elements.push(<div key="nm">{nb.render(pad, pad)}</div>);
      elements.push(<ProductPhoto key="ph" item={item} x={pad} y={pad + nb.height + gap} w={iw} h={photoH} bg={photoBg} radius={radius * 0.6} />);
    } else {
      elements.push(<ProductPhoto key="ph" item={item} x={pad} y={pad} w={iw} h={photoH} bg={photoBg} radius={radius * 0.6} />);
      elements.push(<div key="nm">{nb.render(pad + photoH + gap, pad)}</div>);
    }
    elements.push(<PriceTag key="pr" offer={item.offer} unit={item.unit} x={pad} y={h - pad - priceH} w={iw} h={priceH} skin={skin} fontScale={fs} />);
    if (model.discount > 0) elements.push(<DiscountBadge key="bd" pct={model.discount} x={w - pad} y={composition === "top-name" ? pad + nb.height + gap : pad} size={badgeSize} skin={skin} />);
  }

  // faixa de destaque: canto superior esquerdo da FOTO (o selo de % fica no canto direito)
  const ph = elements.find((e) => e.key === "ph")?.props as { x: number; y: number; w: number; h: number } | undefined;
  if (isHero && skin.hero && !single && ph) {
    const room = ph.w - (model.discount > 0 ? badgeSize * 1.1 : 0) - ph.w * 0.04;
    const label = skin.hero.label.toUpperCase();
    const hfs = fitOneLine(label, room * 0.8, clamp(S * 0.05, 8, 26), { family: skin.fonts.display.family, upper: true, letterSpacing: 0.06, minFs: 6 });
    const hfg = ensureContrast(skin.hero.fg, skin.hero.bg, 4.5);
    elements.push(
      <div key="hero" data-ev-hero="" style={{ position: "absolute", left: round(ph.x + ph.w * 0.03), top: round(ph.y + ph.w * 0.03), maxWidth: round(room), padding: `${round(hfs * 0.25)}px ${round(hfs * 0.6)}px`, background: skin.hero.bg, color: hfg, fontFamily: fontStack(skin.fonts.display.family), fontWeight: 800, fontSize: hfs, lineHeight: 1.1, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: round(hfs * 0.3), whiteSpace: "nowrap", overflow: "hidden" }}>{label}</div>,
    );
  }

  const border = skin.card.border && skin.card.borderWidth ? `${round(Math.max(1, skin.card.borderWidth * (S / 220)))}px solid ${skin.card.border}` : undefined;
  return (
    <div data-ev-cell={item.id} data-ev-size={size} aria-label={item.name}
      style={{ position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), background: cardBg, color: cardFg, borderRadius: radius, border, boxShadow: skin.card.shadow, overflow: "hidden", boxSizing: "border-box" }}>
      {/* o conteúdo usa coordenadas da caixa externa: compensa a borda */}
      <div style={{ position: "absolute", inset: border ? -Math.max(1, (skin.card.borderWidth ?? 0) * (S / 220)) : 0 }}>{elements}</div>
    </div>
  );
}
