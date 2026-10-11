// Card de produto (v2): cartão claro sobre fundo saturado, nome em caixa alta condensada,
// foto grande (contain + imageFit, nunca distorcida), placa de preço como elemento mais forte,
// estrela de desconto no canto da foto e destaque dourado maior.
import type { CSSProperties, ReactElement } from "react";
import type { LayoutCell } from "../contract";
import type { RenderItem } from "@/domain/campaign";
import { ensureContrast } from "../parts/color";
import { NoPhotoGlyph } from "../parts/glyphs";
import { capOf, clamp, fitLines, fitWidth, fontStack, r1, textWidth } from "./measure";
import { planPrice } from "./PricePlate";
import { starPath } from "./grounds";
import { QrBlock } from "./Qr";
import { darken, lighten, type Ctx2, type Look } from "./look";

export function Photo2({ item, x, y, w, h, muted }: { item: RenderItem; x: number; y: number; w: number; h: number; muted: string }) {
  const fit = item.imageFit ?? { x: 50, y: 50, zoom: 1 };
  const box: CSSProperties = { position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), overflow: "hidden" };
  if (!item.imageUrl) {
    const g = Math.min(w, h);
    return (
      <div data-ev-photo="vazio" style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: g * 0.04 }}>
        <NoPhotoGlyph size={r1(clamp(g * 0.32, 10, 170))} color={muted} />
        {g > 40 && <span style={{ fontFamily: fontStack("Inter"), fontSize: r1(clamp(g * 0.09, 7, 30)), fontWeight: 700, color: muted, letterSpacing: "0.04em" }}>sem foto</span>}
      </div>
    );
  }
  const S = Math.min(w, h);
  return (
    <div data-ev-photo="" style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.name} draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: `${fit.x}% ${fit.y}%`, transform: fit.zoom && fit.zoom !== 1 ? `scale(${fit.zoom})` : undefined, transformOrigin: `${fit.x}% ${fit.y}%`, display: "block", filter: `drop-shadow(0 ${r1(S * 0.025)}px ${r1(S * 0.03)}px rgba(0,0,0,.28))` }} />
    </div>
  );
}

/** Nome (caixa alta condensada, linhas explícitas) + linha de marca/gramatura. */
export function nameBlock2(item: RenderItem, look: Look, w: number, maxH: number, o: { maxFs: number; minFs: number; maxLines: number; align: "left" | "center"; color: string; meta: string }) {
  const nf = look.fonts.name;
  const text = nf.upper ? item.name.toLocaleUpperCase("pt-BR") : item.name;
  const meta = [item.brand, item.sizeLabel].filter(Boolean).join(" · ");
  const lh = nf.upper ? 1.02 : 1.1;
  let metaFs = meta ? Math.max(6, Math.min(o.maxFs * 0.56, fitWidth(meta, look.fonts.body, w, o.maxFs * 0.56, 6))) : 0;
  const metaH = meta ? metaFs * 1.25 : 0;
  const fit = fitLines(text, nf, w * 0.95, Math.max(4, maxH - metaH), { maxFs: o.maxFs, minFs: o.minFs, maxLines: o.maxLines, lineHeight: lh });
  metaFs = Math.min(metaFs, Math.max(6, fit.fs * 0.7));
  // corte em N linhas: reticências na última linha, encurtando-a até caber
  const ellipsis = (l: string) => {
    let t = l;
    while (t.length > 1 && textWidth(`${t}…`, nf, fit.fs) > w * 0.95) t = t.slice(0, -1).trimEnd();
    return `${t}…`;
  };
  const lines = fit.lines.map((l, i) => (fit.truncated && i === fit.lines.length - 1 ? ellipsis(l) : l));
  const nameH = lines.length * fit.fs * lh;
  const height = nameH + metaH;
  const render = (x: number, y: number) => (
    <div key="nm" style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w) }}>
      <div lang="pt-BR" data-ev-name="" title={item.name} style={{ fontFamily: fontStack(nf.family), fontWeight: nf.weight, fontStyle: nf.italic ? "italic" : undefined, fontSize: fit.fs, lineHeight: lh, color: o.color, textAlign: o.align, height: r1(nameH) }}>
        {lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
      </div>
      {meta && <div style={{ fontFamily: fontStack(look.fonts.body.family), fontWeight: 600, fontSize: r1(metaFs), lineHeight: 1.25, color: o.meta, textAlign: o.align, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
    </div>
  );
  return { height, render, truncated: fit.truncated, fs: fit.fs };
}

/** Estrela de desconto "-28%" (somente com preço anterior informado). */
export function DiscountStar({ pct, x, y, size, look }: { pct: number; x: number; y: number; size: number; look: Look }) {
  if (pct <= 0) return null;
  const text = `-${pct}%`;
  const fg = ensureContrast(look.burst.fg, look.burst.bg, 4.5);
  const pf = look.fonts.price;
  const fs = fitWidth(text, pf, size * 0.6, size * 0.34, 5);
  return (
    <div data-ev-badge="desconto" aria-label={`${pct}% de desconto`} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(size), height: r1(size) }}>
      <svg aria-hidden="true" viewBox="0 0 100 100" width={r1(size)} height={r1(size)} style={{ position: "absolute", inset: 0, overflow: "visible", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }}>
        <path d={starPath(50, 50, 50, 39, 14, -1.75)} fill={look.burst.ring} />
        <path d={starPath(50, 50, 45, 35, 14, -1.75)} fill={look.burst.bg} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(pf.family), fontWeight: pf.weight, fontSize: fs, lineHeight: 1, color: fg, transform: "rotate(-10deg)", paddingTop: r1(fs * (1 - capOf(pf)) * 0.15) }}>{text}</div>
    </div>
  );
}

function HeroLabel({ text, x, y, maxW, h, look }: { text: string; x: number; y: number; maxW: number; h: number; look: Look }) {
  const t = text.toLocaleUpperCase("pt-BR");
  const f = look.fonts.label;
  const fs = fitWidth(t, f, maxW - h * 0.9, h * 0.6, 6);
  const w = Math.min(maxW, textWidth(t, f, fs) + h * 0.9);
  const fg = ensureContrast(look.card.heroLabelFg, look.card.heroLabelBg, 4.5);
  return (
    <div data-ev-hero="" style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: look.card.heroLabelBg, color: fg, fontFamily: fontStack(f.family), fontWeight: f.weight, fontStyle: f.italic ? "italic" : undefined, fontSize: fs, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", clipPath: `polygon(0 0, 100% 0, calc(100% - ${r1(h * 0.35)}px) 100%, 0 100%)`, paddingRight: r1(h * 0.2), letterSpacing: "0.03em" }}>{t}</div>
  );
}

export function Card2({ cell, ctx }: { cell: LayoutCell; ctx: Ctx2 }): ReactElement {
  const { look, format, campaign } = ctx;
  const { item, size } = cell;
  const { x, y, w, h } = cell.rect;
  const S = Math.min(w, h);
  const single = format.kind === "single";
  const hi = !single && (size === "hero" || size === "large");
  const fsc = ctx.fontScale;
  const pad = r1(clamp(S * (single ? 0.035 : 0.05), 4, 34));
  const iw = w - pad * 2, ih = h - pad * 2;
  const bg = hi ? look.card.heroBg : look.card.bg;
  const fg = ensureContrast(hi ? look.card.heroFg : look.card.fg, bg, 4.5);
  const meta = ensureContrast(look.card.meta, bg, 4.5);
  const muted = ensureContrast("#6b7280", bg, 3);
  const radius = r1(clamp(S * look.card.radius, 3, 30));
  const els: ReactElement[] = [];
  const priceOpts = { scale: fsc, onBg: bg, onFg: fg };
  let photo: { x: number; y: number; w: number; h: number } | null = null;
  let discount = 0;

  const wide = !single && w / h >= 1.25;
  if (single) {
    // cartaz: nome grande no topo, foto ao centro, preço gigante embaixo (+ QR da vitrine)
    const nb = nameBlock2(item, look, iw, ih * 0.18, { maxFs: clamp(S * 0.12, 12, 150) * fsc, minFs: clamp(S * 0.05, 9, 48), maxLines: 3, align: "center", color: fg, meta });
    const site = campaign.brand.website?.trim();
    const qr = site ? r1(Math.min(ih * 0.3, iw * 0.24)) : 0;
    const pw = qr ? iw - qr - pad : iw;
    const plan = planPrice(item.offer, item.unit, look, pw, ih * 0.5, { ...priceOpts, align: qr ? "right" : "center", maxExtras: 3 });
    const py = h - pad - plan.h;
    els.push(nb.render(pad, pad));
    const top = pad + nb.height + pad * 0.6;
    photo = { x: pad + iw * 0.04, y: top, w: iw * 0.92, h: Math.max(20, py - pad * 0.6 - top) };
    els.push(plan.render(qr ? pad + qr + pad : pad, py));
    if (qr && site) els.push(<QrBlock key="qr" url={site} x={pad} y={h - pad - qr} size={qr} />);
    discount = plan.model.discount;
  } else if (wide) {
    const photoW = iw * 0.44;
    const colX = pad + photoW + pad * 0.7;
    const colW = w - colX - pad;
    const nb = nameBlock2(item, look, colW, ih * 0.36, { maxFs: clamp(S * 0.12, 9, 70) * fsc, minFs: clamp(S * 0.065, 7.5, 28), maxLines: 3, align: "left", color: fg, meta });
    const plan = planPrice(item.offer, item.unit, look, colW, ih - nb.height - pad * 0.5, { ...priceOpts, align: "right" });
    els.push(nb.render(colX, pad));
    photo = { x: pad, y: pad, w: photoW, h: ih };
    els.push(plan.render(colX, h - pad - plan.h));
    discount = plan.model.discount;
  } else {
    const compact = size === "compact";
    const nb = nameBlock2(item, look, iw, ih * (compact ? 0.24 : 0.2), { maxFs: clamp(S * (hi ? 0.075 : 0.092), 8.5, 64) * fsc, minFs: clamp(S * 0.052, 7, 26), maxLines: compact ? 2 : 3, align: "left", color: fg, meta });
    const top = pad + nb.height + pad * 0.35;
    els.push(nb.render(pad, pad));
    // B: foto em largura total acima do preço largo
    const planB = planPrice(item.offer, item.unit, look, iw, ih * (hi ? 0.42 : 0.46), { ...priceOpts, align: "right", maxF: (ih * (hi ? 0.3 : 0.33)) / (capOf(look.fonts.price) + 0.22) });
    const baseB = Math.max(10, h - pad - planB.h - top);
    const overB = Math.min(baseB * 0.12, planB.h * 0.35); // a área do preço cobre no máximo ~11% da foto
    const photoB = { x: pad, y: top, w: iw, h: baseB + overB };
    // A: foto em altura total à esquerda, placa de preço mais estreita no canto inferior direito
    const pw = iw * (hi ? 0.58 : 0.6);
    const planA = planPrice(item.offer, item.unit, look, pw, ih * 0.5, { ...priceOpts, align: "right" });
    const phA = Math.max(10, h - pad - top);
    // sobreposição (iw - pw ... pwid) × plan.h deve ficar ≤ 11% da área da foto
    const lim = planA.h < phA * 0.9 ? (iw - pw) * planA.h / Math.max(1, planA.h - 0.11 * phA) : iw * 0.7;
    const pwid = clamp(lim, iw - pw, iw * 0.7);
    const photoA = { x: pad, y: top, w: pwid, h: phA };
    const useA = planA.h < phA * 0.75 && photoA.w * photoA.h > photoB.w * photoB.h * 1.08;
    const plan = useA ? planA : planB;
    photo = useA ? photoA : photoB;
    els.push(plan.render(useA ? w - pad - pw : pad, h - pad - plan.h));
    discount = plan.model.discount;
  }

  const layers: ReactElement[] = [];
  if (photo) {
    layers.push(<div key="glow" aria-hidden="true" style={{ position: "absolute", left: r1(photo.x), top: r1(photo.y), width: r1(photo.w), height: r1(photo.h), background: `radial-gradient(closest-side, ${hi ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.9)"}, rgba(255,255,255,0))` }} />);
    layers.push(<Photo2 key="ph" item={item} {...photo} muted={muted} />);
    if (discount > 0) {
      const s = r1(Math.min(Math.sqrt(0.12 * photo.w * photo.h), photo.w * 0.36, photo.h * 0.5, single ? 220 : 140));
      layers.push(<DiscountStar key="ds" pct={discount} x={photo.x + photo.w - s} y={photo.y} size={s} look={look} />);
    }
    if (hi) {
      const lh = r1(clamp(S * 0.06, 12, 34));
      layers.push(<HeroLabel key="hl" text={look.card.heroLabel} x={0} y={photo.y + lh * 0.2} maxW={photo.w * 0.6} h={lh} look={look} />);
    }
  }

  const border = look.card.border ? `${r1(Math.max(1, S * 0.008))}px solid ${look.card.border}` : undefined;
  return (
    <div data-ev-cell={item.id} data-ev-size={size} aria-label={item.name}
      style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: hi ? `linear-gradient(160deg, ${lighten(bg, 0.25)} 0%, ${bg} 55%, ${darken(bg, 0.08)} 100%)` : `linear-gradient(180deg, ${lighten(bg, 0.5)} 0%, ${bg} 100%)`, color: fg, borderRadius: radius, boxShadow: look.card.shadow, overflow: "hidden", outline: border, outlineOffset: border ? -Math.max(1, S * 0.008) : undefined }}>
      {layers}
      {els}
    </div>
  );
}
