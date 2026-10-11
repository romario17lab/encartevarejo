// Card de produto (v3): foto que sai do card pelo topo (dentro do retângulo da célula, nunca sobre o
// nome ou o preço), variações de card (recorte, orelha colorida com o nome, disco/hexágono atrás da foto,
// pílula de duas cores, moldura, arco), etiqueta de preço como herói e sombra dura (sem desfoque).
// Produto herói (1 item na página, item em destaque ou cartaz): pedestal ou placa grande.
// Fotos sempre com object-fit: contain (Photo2) — nunca distorcidas.
import type { ReactElement } from "react";
import type { LayoutCell } from "../contract";
import type { RenderItem } from "@/domain/campaign";
import { ensureContrast } from "../parts/color";
import { capOf, clamp, fitLines, fitWidth, fontStack, r1, textWidth } from "../parts2/measure";
import { Photo2 } from "../parts2/Card2";
import { QrBlock } from "../parts2/Qr";
import { starPath } from "../parts2/grounds";
import { darken, hid, lighten } from "../parts2/look";
import { planPrice3, type PricePlan3 } from "./PriceTag3";
import type { CardStyle3, Ctx3, Look3 } from "./look3";

type Box = { x: number; y: number; w: number; h: number };

/** Nome (linhas explícitas) + linha de marca/gramatura. */
export function nameBlock3(item: RenderItem, look: Look3, w: number, maxH: number, o: { maxFs: number; minFs: number; maxLines: number; align: "left" | "center"; color: string; meta: string }) {
  const nf = look.fonts.name;
  const text = nf.upper ? item.name.toLocaleUpperCase("pt-BR") : item.name;
  const meta = [item.brand, item.sizeLabel].filter(Boolean).join(" · ");
  const lh = nf.upper ? 1.04 : 1.12;
  let metaFs = meta ? Math.max(6, Math.min(o.maxFs * 0.56, fitWidth(meta, look.fonts.body, w, o.maxFs * 0.56, 6))) : 0;
  const metaH = meta ? metaFs * 1.25 : 0;
  const fit = fitLines(text, nf, w * 0.96, Math.max(4, maxH - metaH), { maxFs: o.maxFs, minFs: o.minFs, maxLines: o.maxLines, lineHeight: lh });
  metaFs = Math.min(metaFs, Math.max(6, fit.fs * 0.72));
  const ellipsis = (l: string) => {
    let t = l;
    while (t.length > 1 && textWidth(`${t}…`, nf, fit.fs) > w * 0.96) t = t.slice(0, -1).trimEnd();
    return `${t}…`;
  };
  // linha que não cabe nem no tamanho mínimo (palavra enorme): corta com reticências e marca como truncado
  const over = fit.lines.some((l) => textWidth(l, nf, fit.fs) > w * 0.96 + 0.5);
  const truncated = fit.truncated || over;
  const lines = fit.lines.map((l, i) => ((fit.truncated && i === fit.lines.length - 1) || textWidth(l, nf, fit.fs) > w * 0.96 + 0.5 ? ellipsis(l) : l));
  const nameH = lines.length * fit.fs * lh;
  const height = nameH + (meta ? metaFs * 1.25 : 0);
  const widest = Math.max(...lines.map((l) => textWidth(l, nf, fit.fs)), meta ? textWidth(meta, look.fonts.body, metaFs) : 0);
  const render = (x: number, y: number, key = "nm") => (
    <div key={key} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w) }}>
      <div lang="pt-BR" data-ev-name="" title={item.name} style={{ fontFamily: fontStack(nf.family), fontWeight: nf.weight, fontStyle: nf.italic ? "italic" : undefined, fontSize: fit.fs, lineHeight: lh, color: o.color, textAlign: o.align, height: r1(nameH) }}>
        {lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
      </div>
      {meta && <div style={{ fontFamily: fontStack(look.fonts.body.family), fontWeight: 600, fontSize: r1(metaFs), lineHeight: 1.25, color: o.meta, textAlign: o.align, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
    </div>
  );
  return { height, render, truncated, fs: fit.fs, widest };
}

/** Selo de desconto "-28%" (somente com preço anterior informado), com sombra dura. */
export function PercentStar3({ pct, x, y, size, look }: { pct: number; x: number; y: number; size: number; look: Look3 }) {
  if (pct <= 0) return null;
  const text = `-${pct}%`;
  const fg = ensureContrast(look.burst.fg, look.burst.bg, 4.5);
  const pf = look.fonts.price;
  const fs = fitWidth(text, pf, size * 0.58, size * 0.34, 5);
  return (
    <div data-ev-badge="desconto" aria-label={`${pct}% de desconto`} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(size), height: r1(size) }}>
      <svg aria-hidden="true" viewBox="0 0 100 100" width={r1(size)} height={r1(size)} style={{ position: "absolute", inset: 0 }}>
        <path d={starPath(52, 52, 46, 37, 14, -1.75)} fill="rgba(0,0,0,.4)" />
        <path d={starPath(49, 49, 46, 37, 14, -1.75)} fill={look.burst.ring} />
        <path d={starPath(49, 49, 41, 33, 14, -1.75)} fill={look.burst.bg} />
      </svg>
      <div style={{ position: "absolute", left: 0, top: 0, width: r1(size * 0.98), height: r1(size * 0.98), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(pf.family), fontWeight: pf.weight, fontSize: fs, lineHeight: 1, color: fg, transform: "rotate(-10deg)", paddingTop: r1(fs * (1 - capOf(pf)) * 0.15) }}>{text}</div>
    </div>
  );
}

function HeroLabel3({ text, x, y, maxW, h, look }: { text: string; x: number; y: number; maxW: number; h: number; look: Look3 }) {
  const t = text.toLocaleUpperCase("pt-BR");
  const f = look.fonts.label;
  const fs = fitWidth(t, f, maxW - h * 0.9, h * 0.6, 6);
  const w = Math.min(maxW, textWidth(t, f, fs) + h * 0.9);
  const fg = ensureContrast(look.card.heroLabelFg, look.card.heroLabelBg, 4.5);
  return (
    <div data-ev-hero="" style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), background: look.card.heroLabelBg, color: fg, fontFamily: fontStack(f.family), fontWeight: f.weight, fontStyle: f.italic ? "italic" : undefined, fontSize: fs, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", borderRadius: r1(h * 0.18), boxShadow: `${r1(h * 0.1)}px ${r1(h * 0.1)}px 0 rgba(0,0,0,.4)`, transform: "rotate(-3deg)", letterSpacing: "0.04em" }}>{t}</div>
  );
}

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${r1(x + R)} ${r1(y)}H${r1(x + w - R)}Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + R)}V${r1(y + h - R)}Q${r1(x + w)} ${r1(y + h)} ${r1(x + w - R)} ${r1(y + h)}H${r1(x + R)}Q${r1(x)} ${r1(y + h)} ${r1(x)} ${r1(y + h - R)}V${r1(y + R)}Q${r1(x)} ${r1(y)} ${r1(x + R)} ${r1(y)}Z`;
};
/** Arco no topo (janela), cantos de baixo levemente arredondados. */
const arch = (x: number, y: number, w: number, h: number, r: number) => {
  const ry = Math.min(w / 2, h * 0.38);
  const R = Math.min(r, h / 4);
  return `M${r1(x)} ${r1(y + ry)}A${r1(w / 2)} ${r1(ry)} 0 0 1 ${r1(x + w)} ${r1(y + ry)}V${r1(y + h - R)}Q${r1(x + w)} ${r1(y + h)} ${r1(x + w - R)} ${r1(y + h)}H${r1(x + R)}Q${r1(x)} ${r1(y + h)} ${r1(x)} ${r1(y + h - R)}Z`;
};
const hexPath = (cx: number, cy: number, R: number) => {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    d += `${i ? "L" : "M"}${r1(cx + R * Math.cos(a))} ${r1(cy + R * Math.sin(a))}`;
  }
  return d + "Z";
};

const BREAKOUT = new Set<CardStyle3>(["recorte", "circulo", "hexagono", "moldura", "arco", "split"]);

interface Plan { body: Box; photo: Box; split?: { vertical: boolean; at: number }; ear?: Box; name: { x: number; y: number; nb: ReturnType<typeof nameBlock3> }; price: { x: number; y: number; plan: PricePlan3 }; pedestal?: Box; plateBack?: Box; qr?: Box }

/** Desenho do corpo do card (SVG): sombra dura, corpo no estilo do modelo, orelha, metade colorida, moldura, disco/hexágono atrás da foto, pedestal. */
function Body({ id, style, plan, w, h, bg, look, sh, radius, hero }: { id: string; style: CardStyle3; plan: Plan; w: number; h: number; bg: string; look: Look3; sh: number; radius: number; hero: boolean }) {
  const C = look.card;
  const b = plan.body;
  const d = style === "arco" ? arch(b.x, b.y, b.w, b.h, radius) : rr(b.x, b.y, b.w, b.h, style === "split" ? Math.max(radius, Math.min(b.w, b.h) * 0.14) : radius);
  const shadow = C.shadow;
  const els: ReactElement[] = [];
  if (plan.ear) {
    const e = plan.ear;
    const ed = rr(e.x, e.y, e.w, e.h + radius * 2, Math.min(radius * 1.2, e.h * 0.45));
    els.push(<path key="es" d={ed} fill={shadow} transform={`translate(${sh} ${sh})`} />);
    els.push(<path key="e" d={ed} fill={C.accent} />);
  }
  els.push(<path key="s" d={d} fill={shadow} transform={`translate(${sh} ${sh})`} />);
  els.push(<path key="b" d={d} fill={bg} stroke={C.border} strokeWidth={C.border ? r1(Math.max(1, sh * 0.5)) : undefined} />);
  if (plan.ear) {
    // a orelha "dobra" sobre o corpo
    const e = plan.ear;
    els.push(<path key="e2" d={rr(e.x, e.y, e.w, e.h, Math.min(radius * 1.2, e.h * 0.45))} fill={C.accent} />);
    els.push(<rect key="e3" x={r1(e.x)} y={r1(e.y + e.h - 1)} width={r1(e.w)} height={r1(Math.max(2, sh * 0.6))} fill={darken(C.accent, 0.25)} />);
  }
  if (plan.split) {
    const s = plan.split;
    els.push(<clipPath key="cp" id={`${id}c`}><path d={d} /></clipPath>);
    els.push(<rect key="sp" clipPath={`url(#${id}c)`} x={r1(s.vertical ? s.at : b.x)} y={r1(s.vertical ? b.y : s.at)} width={r1(s.vertical ? b.x + b.w - s.at : b.w)} height={r1(s.vertical ? b.h : b.y + b.h - s.at)} fill={C.accent} />);
    els.push(<path key="sl" d={s.vertical ? `M${r1(s.at)} ${r1(b.y)}V${r1(b.y + b.h)}` : `M${r1(b.x)} ${r1(s.at)}H${r1(b.x + b.w)}`} stroke={darken(C.accent, 0.3)} strokeWidth={r1(Math.max(2, sh * 0.8))} clipPath={`url(#${id}c)`} />);
  }
  if (style === "moldura") {
    const i1 = Math.max(3, Math.min(b.w, b.h) * 0.03), i2 = i1 * 1.8;
    els.push(<path key="m1" d={rr(b.x + i1, b.y + i1, b.w - i1 * 2, b.h - i1 * 2, radius * 0.7)} fill="none" stroke={C.accent} strokeWidth={r1(Math.max(1.2, i1 * 0.35))} />);
    els.push(<path key="m2" d={rr(b.x + i2, b.y + i2, b.w - i2 * 2, b.h - i2 * 2, radius * 0.5)} fill="none" stroke={C.accent} strokeOpacity={0.55} strokeWidth={r1(Math.max(0.8, i1 * 0.15))} />);
  }
  const p = plan.photo;
  if (style === "circulo" || style === "hexagono") {
    const D = Math.min(p.w, p.h) * (hero ? 0.92 : 1);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const back = hero ? lighten(C.accent, 0.15) : C.accent;
    if (style === "circulo") {
      els.push(<circle key="dk2" cx={r1(cx + sh)} cy={r1(cy + sh)} r={r1(D / 2)} fill={shadow} />);
      els.push(<circle key="dk" cx={r1(cx)} cy={r1(cy)} r={r1(D / 2)} fill={back} />);
      els.push(<circle key="dk3" cx={r1(cx)} cy={r1(cy)} r={r1(D / 2 - Math.max(2, D * 0.04))} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={r1(Math.max(1, D * 0.012))} />);
    } else {
      els.push(<path key="hx2" d={hexPath(cx + sh, cy + sh, D / 2)} fill={shadow} />);
      els.push(<path key="hx" d={hexPath(cx, cy, D / 2)} fill={back} />);
      els.push(<path key="hx3" d={hexPath(cx, cy, D / 2 - Math.max(2, D * 0.045))} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={r1(Math.max(1, D * 0.012))} />);
    }
  }
  if (plan.pedestal) {
    // pedestal: tampo elíptico + coluna, com sombra dura
    const q = plan.pedestal;
    const ry = q.h * 0.22;
    const col = C.accent, top = lighten(C.accent, 0.35), side = darken(C.accent, 0.25);
    els.push(<ellipse key="pd0" cx={r1(q.x + q.w / 2 + sh)} cy={r1(q.y + q.h - ry + sh)} rx={r1(q.w / 2)} ry={r1(ry)} fill={shadow} />);
    els.push(<path key="pd1" d={`M${r1(q.x)} ${r1(q.y + ry)}V${r1(q.y + q.h - ry)}A${r1(q.w / 2)} ${r1(ry)} 0 0 0 ${r1(q.x + q.w)} ${r1(q.y + q.h - ry)}V${r1(q.y + ry)}Z`} fill={col} />);
    els.push(<path key="pd2" d={`M${r1(q.x + q.w * 0.7)} ${r1(q.y + ry)}V${r1(q.y + q.h - ry * 0.3)}`} stroke={side} strokeWidth={r1(q.w * 0.12)} opacity={0.5} />);
    els.push(<ellipse key="pd3" cx={r1(q.x + q.w / 2)} cy={r1(q.y + ry)} rx={r1(q.w / 2)} ry={r1(ry)} fill={top} stroke={side} strokeWidth={r1(Math.max(1, sh * 0.5))} />);
    // raios de impacto atrás do produto
    const cx = q.x + q.w / 2, cy = q.y;
    const R = Math.min(p.w, p.h) * 0.62;
    const rays: ReactElement[] = [];
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + (Math.PI * (i + 0.5)) / 18, a2 = a + Math.PI / 40;
      rays.push(<path key={i} d={`M${r1(cx)} ${r1(cy)}L${r1(cx + R * Math.cos(a))} ${r1(cy + R * Math.sin(a))}L${r1(cx + R * Math.cos(a2))} ${r1(cy + R * Math.sin(a2))}Z`} fill={C.accent} opacity={0.2} />);
    }
    els.unshift(<g key="rays" clipPath={`url(#${id}c)`}>{rays}</g>);
    if (!plan.split) els.unshift(<clipPath key="cp" id={`${id}c`}><path d={d} /></clipPath>);
  }
  if (plan.plateBack) {
    const q = plan.plateBack;
    els.push(<path key="pb2" d={rr(q.x + sh, q.y + sh, q.w, q.h, q.h * 0.12)} fill={shadow} transform={`rotate(-2 ${r1(q.x + q.w / 2)} ${r1(q.y + q.h / 2)})`} />);
    els.push(<path key="pb" d={rr(q.x, q.y, q.w, q.h, q.h * 0.12)} fill={C.accent} transform={`rotate(-2 ${r1(q.x + q.w / 2)} ${r1(q.y + q.h / 2)})`} />);
  }
  return <svg aria-hidden="true" width={r1(w)} height={r1(h)} viewBox={`0 0 ${r1(w)} ${r1(h)}`} style={{ position: "absolute", left: 0, top: 0 }}>{els}</svg>;
}

export function Card3({ cell, ctx, alone }: { cell: LayoutCell; ctx: Ctx3; alone: boolean }): ReactElement {
  const { look, format, campaign } = ctx;
  const C = look.card;
  const { item, size } = cell;
  const { x, y, w, h } = cell.rect;
  const S = Math.min(w, h);
  const single = format.kind === "single";
  const heroMode = single || alone || size === "hero";
  const hi = !single && (size === "hero" || size === "large");
  const fsc = ctx.fontScale;
  const style = C.style;
  const sh = r1(clamp(S * 0.022, 2, 9));
  const radius = r1(clamp(S * C.radius, 3, 34));
  const pad = r1(clamp(S * (heroMode ? 0.045 : 0.055), 4, 34));
  const bg = hi || (heroMode && !single) ? C.heroBg : C.bg;
  const fg = ensureContrast(hi || (heroMode && !single) ? C.heroFg : C.fg, bg, 4.5);
  const meta = ensureContrast(C.meta, bg, 4.5);
  const muted = ensureContrast("#6b7280", bg, 3);
  const onAcc = ensureContrast(C.accentFg, C.accent, 4.5);
  const metaAcc = ensureContrast(C.accentFg, C.accent, 4.5);
  const bw = w - sh, bh = h - sh;
  const id = `c3${hid(item.id, Math.round(x), Math.round(y), Math.round(w))}`;
  const breakout = BREAKOUT.has(style);
  const wide = !heroMode && w / h >= 1.3;
  let plan: Plan;

  const nameOpts = (onSplit: boolean, align: "left" | "center", maxFs: number, minFs: number, maxLines: number) => ({ maxFs: maxFs * fsc, minFs, maxLines, align, color: onSplit ? onAcc : fg, meta: onSplit ? metaAcc : meta });

  if (heroMode) {
    // ---------- produto herói: pedestal (ou placa grande), nome grande, preço gigante
    const portrait = h >= w * 0.85;
    const hr = breakout && !single ? r1(h * 0.05) : 0;
    const body: Box = { x: 0, y: hr, w: bw, h: bh - hr };
    const ix = pad, iy = hr + pad, iw = bw - pad * 2, ih = bh - hr - pad * 2;
    const site = single ? campaign.brand.website?.trim() : null;
    if (portrait) {
      const nb = nameBlock3(item, look, iw * 0.94, ih * 0.17, nameOpts(false, "center", clamp(S * 0.1, 12, 150), clamp(S * 0.045, 9, 48), 2));
      const qr = site ? r1(Math.min(ih * 0.26, iw * 0.24)) : 0;
      const pw = qr ? iw - qr - pad : iw * 0.94;
      const pl = planPrice3(item.offer, item.unit, look, pw, ih * (single ? 0.44 : 0.42), { scale: fsc, onBg: bg, onFg: fg, align: "center", maxExtras: 3, roundTolerance: 0.48 });
      const py = bh - pad - pl.h;
      const top = iy + nb.height + pad * 0.5;
      const regionH = Math.max(20, py - pad * 0.6 - top);
      let photo: Box, pedestal: Box | undefined, plateBack: Box | undefined;
      if (look.hero === "pedestal") {
        const pedH = regionH * 0.2, pedW = Math.min(iw * 0.62, regionH * 0.95);
        pedestal = { x: ix + (iw - pedW) / 2, y: top + regionH - pedH, w: pedW, h: pedH };
        photo = { x: ix + iw * 0.08, y: top, w: iw * 0.84, h: regionH - pedH * 0.62 };
      } else {
        photo = { x: ix + iw * 0.04, y: top, w: iw * 0.92, h: regionH };
        plateBack = { x: ix + (qr ? qr + pad : (iw - Math.min(iw, pl.plateW * 1.25)) / 2), y: py + pl.h * 0.08, w: Math.min(qr ? pw : iw, pl.plateW * 1.25), h: pl.h * 0.92 };
      }
      plan = { body, photo, pedestal, plateBack, name: { x: ix + iw * 0.03, y: iy, nb }, price: { x: qr ? ix + qr + pad : ix + (iw - pw) / 2, y: py, plan: pl }, qr: qr ? { x: ix, y: bh - pad - qr, w: qr, h: qr } : undefined };
    } else {
      const colW = iw * 0.5;
      const cx = ix + iw - colW;
      const nb = nameBlock3(item, look, colW, ih * 0.34, nameOpts(false, "left", clamp(S * 0.13, 12, 120), clamp(S * 0.06, 8, 40), 3));
      const pl = planPrice3(item.offer, item.unit, look, colW, ih - nb.height - pad, { scale: fsc, onBg: bg, onFg: fg, align: "left", maxExtras: 3, roundTolerance: 0.48 });
      const regionW = iw - colW - pad;
      let photo: Box, pedestal: Box | undefined, plateBack: Box | undefined;
      if (look.hero === "pedestal") {
        const pedH = ih * 0.18, pedW = Math.min(regionW * 0.8, ih);
        pedestal = { x: ix + (regionW - pedW) / 2, y: iy + ih - pedH, w: pedW, h: pedH };
        photo = { x: ix, y: breakout ? 0 : iy, w: regionW, h: iy + ih - pedH * 0.62 - (breakout ? 0 : iy) };
      } else {
        photo = { x: ix, y: breakout ? 0 : iy, w: regionW, h: iy + ih - (breakout ? 0 : iy) };
        plateBack = { x: cx - pad * 0.3, y: bh - pad - pl.h - pad * 0.2, w: Math.min(colW + pad * 0.3, pl.plateW * 1.2), h: pl.h + pad * 0.2 };
      }
      const priceY = Math.min(bh - pad - pl.h, iy + nb.height + pad + Math.max(0, (ih - nb.height - pad - pl.h) * 0.5));
      plan = { body, photo, pedestal, plateBack, name: { x: cx, y: iy, nb }, price: { x: cx, y: priceY, plan: pl } };
    }
  } else if (wide) {
    // ---------- card largo (2×1, banner, tv): foto à esquerda saindo pelo topo, nome e preço à direita
    const hr = breakout ? r1(h * 0.08) : 0;
    const photoW = (bw - pad * 2) * 0.44;
    const colX = pad + photoW + pad * 0.8;
    const colW = bw - colX - pad;
    let ear: Box | undefined, split: Plan["split"];
    let nb: ReturnType<typeof nameBlock3>;
    let body: Box;
    let nameY: number;
    if (style === "orelha") {
      nb = nameBlock3(item, look, Math.min(bw - pad * 2, colW + photoW), bh * 0.24, nameOpts(true, "left", clamp(S * 0.12, 9, 60), clamp(S * 0.065, 7.5, 26), 2));
      const eh = nb.height + pad * 0.8;
      ear = { x: 0, y: 0, w: Math.min(bw, Math.max(bw * 0.5, nb.widest + pad * 2)), h: eh };
      body = { x: 0, y: eh, w: bw, h: bh - eh };
      nameY = pad * 0.4;
    } else {
      body = { x: 0, y: hr, w: bw, h: bh - hr };
      if (style === "split") split = { vertical: true, at: colX - pad * 0.4 };
      nb = nameBlock3(item, look, colW, (bh - hr) * 0.36, nameOpts(style === "split", "left", clamp(S * 0.12, 9, 70), clamp(S * 0.065, 7.5, 28), 3));
      nameY = hr + pad;
    }
    const onSplit = style === "split";
    const priceTop = (ear ? body.y + pad * 0.6 : nameY + nb.height + pad * 0.5);
    const pl = planPrice3(item.offer, item.unit, look, colW, bh - pad - priceTop, { scale: fsc, onBg: onSplit ? C.accent : bg, onFg: onSplit ? onAcc : fg, align: "right" });
    const photo: Box = ear ? { x: pad, y: body.y + pad * 0.5, w: photoW, h: bh - body.y - pad * 1.5 } : { x: pad, y: 0, w: photoW, h: bh - pad };
    plan = { body, photo, ear, split, name: { x: ear ? pad : colX, y: nameY, nb }, price: { x: colX, y: bh - pad - pl.h, plan: pl } };
  } else {
    // ---------- card vertical: foto no topo (saindo do card), nome, preço embaixo (ou nome ao lado do preço)
    const compact = size === "compact";
    const hr = breakout ? r1(h * 0.085) : 0;
    const iw = bw - pad * 2;
    const nameMax = clamp(S * (hi ? 0.08 : 0.095), 8.5, 60);
    const nameMin = clamp(S * 0.052, 7, 24);
    const maxLines = compact ? 2 : 3;
    let ear: Box | undefined;
    let bodyTop = hr;
    let nbEar: ReturnType<typeof nameBlock3> | null = null;
    if (style === "orelha") {
      nbEar = nameBlock3(item, look, iw, bh * 0.22, nameOpts(true, "left", nameMax, nameMin, maxLines));
      const eh = nbEar.height + pad * 0.9;
      ear = { x: 0, y: 0, w: Math.min(bw, Math.max(bw * 0.62, nbEar.widest + pad * 2.2)), h: eh };
      bodyTop = eh;
    }
    const ih = bh - bodyTop - pad * 2;
    const bottom = bh - pad;
    const onSplit = style === "split";
    const pBg = onSplit ? C.accent : bg, pFg = onSplit ? onAcc : fg;
    const maxF = (ih * (hi ? 0.32 : 0.36)) / (capOf(look.fonts.price) + 0.4);
    // A: nome acima do preço (largura total)
    const plA = planPrice3(item.offer, item.unit, look, iw, ih * (hi ? 0.44 : 0.48), { scale: fsc, onBg: pBg, onFg: pFg, maxF });
    const nbA = nbEar ?? nameBlock3(item, look, iw, ih * (compact ? 0.24 : 0.2), nameOpts(onSplit, C.align, nameMax, nameMin, maxLines));
    const contentA = plA.h + (nbEar ? 0 : nbA.height + pad * 0.4);
    // B: nome à esquerda do preço (mais foto quando o preço é estreito)
    let useB = false;
    let wB = iw * 0.62;
    let plB: PricePlan3 | null = null, nbB: ReturnType<typeof nameBlock3> | null = null;
    if (!nbEar && !compact) {
      const probe = planPrice3(item.offer, item.unit, look, iw * 0.62, ih * 0.46, { scale: fsc, onBg: pBg, onFg: pFg, maxF, align: "right" });
      wB = clamp(probe.plateW * 1.03, iw * 0.42, iw * 0.62);
      plB = planPrice3(item.offer, item.unit, look, wB, ih * 0.46, { scale: fsc, onBg: pBg, onFg: pFg, maxF, align: "right" });
      const nw = iw - wB - pad * 0.5;
      if (nw > iw * 0.36) {
        nbB = nameBlock3(item, look, nw, Math.max(plB.h, ih * 0.2), nameOpts(onSplit, "left", nameMax, nameMin, 3));
        const contentB = Math.max(plB.h, nbB.height);
        useB = !nbB.truncated && nbB.fs >= nbA.fs * 0.82 && plB.plateH >= plA.plateH * 0.9 && contentB < contentA * 0.86;
      }
    }
    const pl = useB ? plB! : plA;
    const nb = useB ? nbB! : nbA;
    const contentTop = useB ? bottom - Math.max(pl.h, nb.height) : bottom - contentA;
    const photoTop = breakout ? 0 : bodyTop + pad * 0.6;
    const photoBottom = contentTop - pad * 0.45;
    const photo: Box = { x: pad * 0.6, y: photoTop, w: bw - pad * 1.2, h: Math.max(10, photoBottom - photoTop) };
    const split: Plan["split"] = onSplit ? { vertical: false, at: contentTop - pad * 0.45 } : undefined;
    const nameY = nbEar ? pad * 0.45 : useB ? bottom - nb.height : contentTop;
    plan = {
      body: { x: 0, y: bodyTop, w: bw, h: bh - bodyTop }, photo, ear, split,
      name: { x: pad, y: nameY, nb },
      price: { x: useB ? pad + iw - wB : pad, y: bottom - pl.h, plan: pl },
    };
  }

  const els: ReactElement[] = [];
  els.push(<Body key="body" id={id} style={style} plan={plan} w={w} h={h} bg={bg} look={look} sh={sh} radius={radius} hero={heroMode} />);
  els.push(<Photo2 key="ph" item={item} {...plan.photo} muted={muted} />);
  const discount = plan.price.plan.model.discount;
  if (discount > 0) {
    const p = plan.photo;
    const s = r1(Math.min(Math.sqrt(0.11 * p.w * p.h), p.w * 0.34, p.h * 0.48, single ? 220 : 150));
    const by = Math.max(plan.body.y + pad * 0.2, p.y);
    els.push(<PercentStar3 key="ds" pct={discount} x={p.x + p.w - s} y={by} size={s} look={look} />);
  }
  if (hi || (heroMode && !single)) {
    const lh = r1(clamp(S * 0.055, 12, 32));
    els.push(<HeroLabel3 key="hl" text={C.heroLabel} x={pad * 0.5} y={heroMode ? plan.photo.y + pad * 0.2 : plan.body.y + pad * 0.4} maxW={plan.photo.w * 0.5} h={lh} look={look} />);
  }
  els.push(plan.name.nb.render(plan.name.x, plan.name.y));
  els.push(plan.price.plan.render(plan.price.x, plan.price.y));
  if (plan.qr && campaign.brand.website) els.push(<QrBlock key="qr" url={campaign.brand.website.trim()} x={plan.qr.x} y={plan.qr.y} size={plan.qr.w} />);
  return (
    <div data-ev-cell={item.id} data-ev-size={size} data-ev-card={style} aria-label={item.name} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), color: fg, overflow: "hidden" }}>
      {els}
    </div>
  );
}
