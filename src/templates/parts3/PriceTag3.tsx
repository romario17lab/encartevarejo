// Etiqueta de preço (v3) — o herói do card, em vários formatos:
//   placa, pílula, etiqueta com furo, círculo com borda, selo ondulado, número solto, bandeira, ticket, explosão.
// Ordem fixa: "R$" pequeno · inteiro 3–4× maior · centavos pequenos no alto · unidade num selo próprio ("KG").
// Contraste máximo: contorno sólido + sombra dura deslocada (sem desfoque).
// Todas as mecânicas (simples, de/por, a partir de, leve N, clube, limite, pagamento, condições) vêm de
// priceModel2 (dados estruturados); nada é inventado. Desconto só com preço anterior informado.
import type { ReactElement } from "react";
import { priceParts } from "@/domain/money";
import type { Offer, Unit } from "@/domain/offer";
import { contrast, ensureContrast, readableOn } from "../parts/color";
import { capOf, clamp, fitLines, fitWidth, fontStack, r1, textWidth, type Face } from "../parts2/measure";
import { priceModel2, type PriceModel2 } from "../parts2/offer2";
import { starPath } from "../parts2/grounds";
import type { Look3, PriceShape3 } from "./look3";

export interface PricePlan3 {
  h: number;
  plateW: number;
  plateH: number;
  shape: PriceShape3;
  model: PriceModel2;
  render: (x: number, y: number) => ReactElement;
}

export interface PriceOpts3 {
  scale?: number;
  align?: "left" | "center" | "right";
  maxExtras?: number;
  onBg: string;
  onFg: string;
  maxF?: number;
  /** força um formato (ex.: etiquetas de gôndola) */
  shape?: PriceShape3;
  /** quanto menor a forma redonda pode ficar antes de trocar pela prima larga (padrão 0,62; herói 0,5) */
  roundTolerance?: number;
}

const SEAL_FACE: Face = { family: "Inter", weight: 900 };
const CUR = 0.28; // "R$" em relação ao inteiro (≈ 3,6× menor)
const CENTS = 0.44;
const ROUND = new Set<PriceShape3>(["circulo", "selo", "explosao"]);
const WIDE_OF: Partial<Record<PriceShape3, PriceShape3>> = { circulo: "pilula", selo: "ticket", explosao: "placa" };

/** Texto do selo de unidade: "/kg" → "KG", "un" → "UN", "cada" → "CADA". */
export function sealText(suffix: string | null): string | null {
  if (!suffix) return null;
  return suffix.replace(/^\//, "").toLocaleUpperCase("pt-BR");
}

interface Geo { SW: number; SH: number; ox: number; oy: number }

/** Caixa da forma (em unidades do tamanho do inteiro), para um conteúdo cw × ch. */
function shapeGeo(shape: PriceShape3, cw: number, ch: number): Geo {
  const hyp = Math.hypot(cw, ch) * 0.95;
  switch (shape) {
    case "placa": return { SW: cw + 0.28, SH: ch + 0.24, ox: 0.14, oy: 0.12 };
    case "pilula": { const SH = ch + 0.26; const px = SH * 0.4; return { SW: cw + px * 2, SH, ox: px, oy: 0.13 }; }
    case "etiqueta": { const SH = ch + 0.26; const left = SH * 0.55; return { SW: cw + left + 0.14, SH, ox: left, oy: 0.13 }; }
    case "bandeira": { const SH = ch + 0.26; const right = SH * 0.42; return { SW: cw + 0.15 + right, SH, ox: 0.15, oy: 0.13 }; }
    case "ticket": { const SH = ch + 0.26; const px = SH * 0.3; return { SW: cw + px * 2, SH, ox: px, oy: 0.13 }; }
    case "circulo": { const D = hyp + 0.34; return { SW: D, SH: D, ox: (D - cw) / 2, oy: (D - ch) / 2 }; }
    case "selo": { const D = hyp + 0.46; return { SW: D, SH: D, ox: (D - cw) / 2, oy: (D - ch) / 2 }; }
    case "explosao": { const D = (hyp / 2 + 0.07) / 0.78 * 2; return { SW: D, SH: D, ox: (D - cw) / 2, oy: (D - ch) / 2 }; }
    case "solto": return { SW: cw + 0.1, SH: ch + 0.1, ox: 0.05, oy: 0.05 };
  }
}

/** Contorno da forma (px), com origem em (0,0). */
function shapePath(shape: PriceShape3, W: number, H: number): string {
  switch (shape) {
    case "placa": { const r = H * 0.16; return `M${r1(r)} 0H${r1(W - r)}Q${r1(W)} 0 ${r1(W)} ${r1(r)}V${r1(H - r)}Q${r1(W)} ${r1(H)} ${r1(W - r)} ${r1(H)}H${r1(r)}Q0 ${r1(H)} 0 ${r1(H - r)}V${r1(r)}Q0 0 ${r1(r)} 0Z`; }
    case "pilula": { const r = H / 2; return `M${r1(r)} 0H${r1(W - r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(W - r)} ${r1(H)}H${r1(r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(r)} 0Z`; }
    case "etiqueta": { const P = H * 0.42, r = H * 0.12; return `M${r1(P)} 0H${r1(W - r)}Q${r1(W)} 0 ${r1(W)} ${r1(r)}V${r1(H - r)}Q${r1(W)} ${r1(H)} ${r1(W - r)} ${r1(H)}H${r1(P)}L0 ${r1(H / 2)}Z`; }
    case "bandeira": { const N = H * 0.32; return `M0 0H${r1(W)}L${r1(W - N)} ${r1(H / 2)}L${r1(W)} ${r1(H)}H0Z`; }
    case "ticket": { const n = H * 0.17, r = H * 0.08; return `M${r1(r)} 0H${r1(W - r)}Q${r1(W)} 0 ${r1(W)} ${r1(r)}V${r1(H / 2 - n)}A${r1(n)} ${r1(n)} 0 0 0 ${r1(W)} ${r1(H / 2 + n)}V${r1(H - r)}Q${r1(W)} ${r1(H)} ${r1(W - r)} ${r1(H)}H${r1(r)}Q0 ${r1(H)} 0 ${r1(H - r)}V${r1(H / 2 + n)}A${r1(n)} ${r1(n)} 0 0 0 0 ${r1(H / 2 - n)}V${r1(r)}Q0 0 ${r1(r)} 0Z`; }
    case "circulo": { const R = W / 2; return `M0 ${r1(R)}A${r1(R)} ${r1(R)} 0 1 0 ${r1(W)} ${r1(R)}A${r1(R)} ${r1(R)} 0 1 0 0 ${r1(R)}Z`; }
    case "selo": {
      const R = W / 2, n = 18, rv = R * 0.9;
      let d = "";
      for (let i = 0; i < n; i++) {
        const a0 = (Math.PI * 2 * i) / n - Math.PI / 2, a1 = (Math.PI * 2 * (i + 1)) / n - Math.PI / 2, am = (a0 + a1) / 2;
        const p0 = [R + rv * Math.cos(a0), R + rv * Math.sin(a0)], p1 = [R + rv * Math.cos(a1), R + rv * Math.sin(a1)], c = [R + R * 1.04 * Math.cos(am), R + R * 1.04 * Math.sin(am)];
        d += `${i ? "" : `M${r1(p0[0])} ${r1(p0[1])}`}Q${r1(c[0])} ${r1(c[1])} ${r1(p1[0])} ${r1(p1[1])}`;
      }
      return d + "Z";
    }
    case "explosao": return starPath(W / 2, H / 2, W / 2, W / 2 * 0.8, 16, -Math.PI / 2);
    case "solto": return "";
  }
}

export function planPrice3(offer: Offer, unit: Unit | null, look: Look3, w: number, maxH: number, o: PriceOpts3): PricePlan3 {
  const model = priceModel2(offer, unit);
  const pf = look.fonts.price;
  const lf = look.fonts.label;
  const bf = look.fonts.body;
  const P = look.price;
  const scale = o.scale ?? 1;
  const align = o.align ?? P.align;
  const lineFg = ensureContrast(o.onFg, o.onBg, 4.5);
  const capP = capOf(pf);
  const extras = model.extras.slice(0, o.maxExtras ?? 2);

  // ---------- linhas pequenas (aba "POR"/"LEVE 3 POR"/clube, preço anterior, sai X cada, limite, pagamento)
  const sFs = clamp(maxH * 0.1, 6.5, 40) * Math.min(1.15, scale);
  const build = (k: number) => {
    const s = sFs * k;
    let rowH = 0, tabFs = 0, tabLines: string[] = [], tabW = 0, oldFs = 0, oldW = 0, oldSeparate = false;
    if (model.tab || model.old) {
      rowH = s * 1.75;
      if (model.tab) {
        tabFs = rowH * 0.58;
        const one = fitWidth(model.tab, lf, w * 0.97 - tabFs * 0.9, tabFs, 5.5);
        if (one >= tabFs * 0.62 || model.tab.length < 12) { tabFs = one; tabLines = [model.tab]; }
        else {
          const f = fitLines(model.tab, lf, w * 0.97 - tabFs * 0.9, rowH * 1.5, { maxFs: tabFs * 0.95, minFs: 5.5, maxLines: 2, lineHeight: 1.08 });
          tabFs = f.fs; tabLines = f.truncated ? [model.tab] : f.lines;
          if (f.truncated) tabFs = fitWidth(model.tab, lf, w * 0.97 - tabFs * 0.9, tabFs, 4);
          rowH = Math.max(rowH, tabLines.length * tabFs * 1.08 + tabFs * 0.55);
        }
        tabW = Math.max(...tabLines.map((l) => textWidth(l, lf, tabFs))) + tabFs * 0.9;
      }
      if (model.old) {
        oldFs = Math.min(rowH * 0.5, s);
        const oldText = `${model.old.label} ${model.old.value}`;
        const room = w - tabW - rowH * 0.25;
        const need = (f: number) => textWidth(oldText, bf, f) + f * 0.9;
        if (need(oldFs) > room) {
          const f2 = fitWidth(oldText, bf, room - oldFs * 0.9, oldFs, 5.5);
          if (f2 >= oldFs * 0.7) oldFs = f2;
          else { oldSeparate = true; oldFs = Math.min(oldFs, fitWidth(oldText, bf, w * 0.96, oldFs, 5.5)); }
        }
        oldW = need(oldFs);
        if (!oldSeparate && tabW + oldW + rowH * 0.25 > w) { oldSeparate = true; oldFs = Math.min(oldFs, fitWidth(oldText, bf, w * 0.96 - oldFs * 0.9, oldFs, 5.5)); oldW = need(oldFs); }
      }
    }
    const subFs0 = model.subs.length ? Math.min(...model.subs.map((x) => fitWidth(x.text, bf, w, s * 0.95, 5.5))) : 0;
    const subs = model.subs.map((x) => (subFs0 < s * 0.75 ? { text: x.short } : { text: x.text }));
    const subFs = subs.length ? Math.min(s * 0.95, ...subs.map((x) => fitWidth(x.text, bf, w, s * 0.95, 5.5))) : 0;
    const xText = extras.join(" · ");
    const xf = xText ? fitLines(xText, bf, w, s * 0.85 * 2.3, { maxFs: s * 0.82, minFs: 5.5, maxLines: 2, lineHeight: 1.15 }) : null;
    const oldRowH = oldSeparate ? oldFs * 1.5 : 0;
    const smallH = rowH + oldRowH + subs.length * subFs * 1.22 + (xf ? xf.lines.length * xf.fs * 1.15 + xf.fs * 0.2 : 0);
    return { rowH, tabFs, tabLines, tabW, oldFs, oldW, oldSeparate, oldRowH, subs, subFs, xf, smallH };
  };
  let sm = build(1);
  const budget = maxH * (model.cents == null ? 0.55 : 0.46);
  if (sm.smallH > budget) sm = build(Math.max(0.55, budget / sm.smallH));
  const gapBelow = sm.subs.length || sm.xf ? maxH * 0.025 : 0;
  const plateMaxH = Math.max(10, maxH - sm.smallH - gapBelow);

  // ---------- forma
  const parts = model.cents != null ? priceParts(model.cents) : null;
  const seal = sealText(model.suffix);
  const ow = 0.045, so = 0.07; // contorno e sombra dura (em unidades do inteiro)
  let shape: PriceShape3 = o.shape ?? P.shape;
  let F = 0, plateW = w, plateH = plateMaxH;
  let metrics = { curW: 0, intW: 0, centsW: 0, colW: 0, sealH: 0, sealW: 0, sealFs: 0, cw: 0, ch: 0 };
  let geo: Geo = { SW: 1, SH: 1, ox: 0, oy: 0 };
  if (parts) {
    const curW = textWidth("R$", pf, CUR);
    const intW = textWidth(parts.integer, pf, 1);
    const centsW = textWidth(`,${parts.decimal}`, pf, CENTS);
    const sealH = seal ? clamp(capP - capP * CENTS - 0.06, 0.24, 0.42) : 0;
    const sealFs = seal ? Math.min(sealH * 0.44, (sealH * 1.9) / Math.max(1, textWidth(seal, SEAL_FACE, 1))) : 0;
    const sealW = seal ? Math.max(sealH, textWidth(seal, SEAL_FACE, sealFs) + sealH * 0.5) : 0;
    const colW = Math.max(centsW, sealW);
    const cw = curW + 0.05 + intW + 0.05 + colW;
    const ch = capP;
    metrics = { curW, intW, centsW, colW, sealH, sealW, sealFs, cw, ch };
    const fFor = (sh: PriceShape3) => {
      const g = shapeGeo(sh, cw, ch);
      const TW = g.SW + ow + so, TH = g.SH + ow + so;
      return { g, F: Math.min(plateMaxH / TH, w / TW, o.maxF ?? Infinity) };
    };
    let best = fFor(shape);
    // forma redonda num espaço largo e baixo: usa a "prima" larga quando a redonda ficaria bem menor
    const alt = WIDE_OF[shape];
    if (alt && ROUND.has(shape)) {
      const b2 = fFor(alt);
      if (best.F < b2.F * (o.roundTolerance ?? 0.62)) { best = b2; shape = alt; }
    }
    F = best.F;
    geo = best.g;
    plateW = Math.max((geo.SW + ow + so) * F, Math.min(w, sm.tabW));
    plateH = (geo.SH + ow + so) * F;
  } else {
    plateH = Math.min(plateMaxH, Math.max(18, w * 0.22));
  }
  const usedH = sm.rowH + sm.oldRowH + plateH + (sm.subs.length ? sm.subs.length * sm.subFs * 1.22 : 0) + gapBelow + (sm.xf ? sm.xf.lines.length * sm.xf.fs * 1.15 + sm.xf.fs * 0.2 : 0);
  const h = Math.min(maxH, usedH);
  const shapeW = parts ? (geo.SW + ow + so) * F : plateW;
  const plateX = align === "left" ? 0 : align === "center" ? (w - shapeW) / 2 : w - shapeW;

  // cores
  const fill = P.bg;
  const textFg = ensureContrast(P.fg, fill, 4.5);
  const outline = P.outline;
  const shadow = P.shadow;
  const looseFill = contrast(fill, outline) >= 3 ? fill : readableOn(outline);

  const renderShape = (): ReactElement => {
    const { curW, intW, centsW, sealH, sealW, sealFs } = metrics;
    const W = shapeW, H = plateH;
    const sx = (geo.SW) * F, sy = (geo.SH) * F;
    const o0 = (ow / 2) * F; // origem da forma (metade do contorno)
    const off = so * F;
    const path = shapePath(shape, sx, sy);
    const cx0 = o0 + geo.ox * F, top = o0 + geo.oy * F;
    const xInt = cx0 + curW * F + 0.05 * F;
    const xCol = xInt + intW * F + 0.05 * F;
    const base = top + capP * F;
    const strokeW = r1(Math.max(1, ow * F));
    const loose = shape === "solto";
    const tf = loose ? looseFill : textFg;
    const glyph = { fontFamily: fontStack(pf.family), fontWeight: pf.weight, fontStyle: pf.italic ? "italic" : undefined } as const;
    const texts = (dx: number, dy: number, color: string, stroke?: { c: string; w: number }) => (
      <g fill={color} {...glyph} stroke={stroke?.c} strokeWidth={stroke ? r1(stroke.w) : undefined} strokeLinejoin="round" transform={dx || dy ? `translate(${r1(dx)} ${r1(dy)})` : undefined}>
        <text x={r1(cx0)} y={r1(top + capP * F * CUR)} fontSize={r1(F * CUR)} textLength={r1(curW * F)} lengthAdjust="spacingAndGlyphs">R$</text>
        <text x={r1(xInt)} y={r1(base)} fontSize={r1(F)} textLength={r1(intW * F)} lengthAdjust="spacingAndGlyphs">{parts!.integer}</text>
        <text x={r1(xCol)} y={r1(top + capP * F * CENTS)} fontSize={r1(F * CENTS)} textLength={r1(centsW * F)} lengthAdjust="spacingAndGlyphs">,{parts!.decimal}</text>
      </g>
    );
    const sealEl = seal ? (() => {
      const sh = sealH * F, sw = sealW * F;
      const scx = xCol + Math.max(sw, centsW * F) / 2, scy = base - sh / 2;
      const sbg = P.sealBg, sfg = ensureContrast(P.sealFg, sbg, 4.5);
      return (
        <g>
          <rect x={r1(scx - sw / 2 + off * 0.45)} y={r1(scy - sh / 2 + off * 0.45)} width={r1(sw)} height={r1(sh)} rx={r1(sh / 2)} fill={shadow} />
          <rect x={r1(scx - sw / 2)} y={r1(scy - sh / 2)} width={r1(sw)} height={r1(sh)} rx={r1(sh / 2)} fill={sbg} stroke={outline} strokeWidth={r1(Math.max(1, strokeW * 0.6))} />
          <text x={r1(scx)} y={r1(scy + capOf(SEAL_FACE) * sealFs * F / 2)} textAnchor="middle" fontFamily={fontStack(SEAL_FACE.family)} fontWeight={SEAL_FACE.weight} fontSize={r1(sealFs * F)} fill={sfg}>{seal}</text>
        </g>
      );
    })() : null;
    const extra: ReactElement[] = [];
    if (shape === "etiqueta") {
      const hr = sy * 0.085;
      extra.push(<circle key="furo" cx={r1(o0 + sy * 0.26)} cy={r1(o0 + sy / 2)} r={r1(hr)} fill={o.onBg} stroke={outline} strokeWidth={strokeW} />);
    }
    if (shape === "ticket") extra.push(<rect key="tr" x={r1(o0 + sy * 0.2)} y={r1(o0 + sy * 0.08)} width={r1(sx - sy * 0.4)} height={r1(sy * 0.84)} rx={r1(sy * 0.05)} fill="none" stroke={textFg} strokeOpacity={0.45} strokeWidth={r1(Math.max(1, F * 0.018))} strokeDasharray={`${r1(F * 0.05)} ${r1(F * 0.04)}`} />);
    if (shape === "circulo") extra.push(<circle key="ring" cx={r1(o0 + sx / 2)} cy={r1(o0 + sy / 2)} r={r1(sx / 2 - F * 0.085)} fill="none" stroke={textFg} strokeOpacity={0.6} strokeWidth={r1(Math.max(1, F * 0.022))} />);
    if (shape === "selo") extra.push(<circle key="ring" cx={r1(o0 + sx / 2)} cy={r1(o0 + sy / 2)} r={r1(sx / 2 * 0.8)} fill="none" stroke={textFg} strokeOpacity={0.5} strokeWidth={r1(Math.max(1, F * 0.018))} strokeDasharray={`${r1(F * 0.03)} ${r1(F * 0.035)}`} />);
    return (
      <svg aria-hidden="true" width={r1(W)} height={r1(H)} viewBox={`0 0 ${r1(W)} ${r1(H)}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {loose ? (
          <>
            {texts(off, off, shadow, { c: shadow, w: ow * F * 2.4 })}
            {texts(0, 0, outline, { c: outline, w: ow * F * 2.4 })}
            {texts(0, 0, tf)}
          </>
        ) : (
          <>
            <path d={path} fill={shadow} transform={`translate(${r1(o0 + off)} ${r1(o0 + off)})`} />
            <path d={path} fill={fill} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round" transform={`translate(${r1(o0)} ${r1(o0)})`} />
            {extra}
            {texts(0, 0, tf)}
          </>
        )}
        {sealEl}
      </svg>
    );
  };

  const render = (x: number, y: number): ReactElement => {
    let cy = 0;
    const els: ReactElement[] = [];
    if (sm.oldSeparate && model.old) {
      els.push(<OldChip key="old" x={align === "left" ? 0 : align === "center" ? (w - sm.oldW) / 2 : w - sm.oldW} y={cy + sm.oldFs * 0.15} fs={sm.oldFs} label={model.old.label} value={model.old.value} look={look} face={bf} />);
      cy += sm.oldRowH;
    }
    if (sm.rowH) {
      const sideOld = !!model.old && !sm.oldSeparate;
      const lead = ROUND.has(shape) ? shapeW * 0.12 : plateH * 0.12;
      const tabX = clamp(plateX + lead, 0, Math.max(0, sideOld ? w - sm.oldW - sm.tabW - sm.rowH * 0.25 : w - sm.tabW));
      if (model.tab) {
        const swap = contrast(P.tabBg, o.onBg) < 1.6;
        const tbg = swap ? P.bg : P.tabBg;
        const tfg = ensureContrast(swap ? P.tabBg : P.tabFg, tbg, 4.5);
        els.push(
          <div key="tab" style={{ position: "absolute", left: r1(tabX), top: r1(cy + sm.rowH * 0.06), width: r1(sm.tabW), height: r1(sm.rowH * 0.9), background: tbg, color: tfg, borderRadius: r1(sm.tabFs * 0.3), boxShadow: `${r1(sm.tabFs * 0.12)}px ${r1(sm.tabFs * 0.12)}px 0 ${P.shadow}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: fontStack(lf.family), fontWeight: lf.weight, fontStyle: lf.italic ? "italic" : undefined, fontSize: sm.tabFs, lineHeight: 1.08, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
            {sm.tabLines.map((l, i) => <span key={i}>{l}</span>)}
          </div>,
        );
      }
      if (sideOld && model.old) {
        const ox = model.tab ? Math.min(w - sm.oldW, Math.max(tabX + sm.tabW + sm.rowH * 0.2, plateX + shapeW - sm.oldW)) : Math.max(0, Math.min(w - sm.oldW, plateX + shapeW - sm.oldW));
        els.push(<OldChip key="old" x={ox} y={cy + (sm.rowH - sm.oldFs * 1.45) / 2} fs={sm.oldFs} label={model.old.label} value={model.old.value} look={look} face={bf} />);
      }
      cy += sm.rowH;
    }
    if (parts) {
      els.push(<div key="plate" data-ev-shape={shape} style={{ position: "absolute", left: r1(plateX), top: r1(cy), width: r1(shapeW), height: r1(plateH) }}>{renderShape()}</div>);
    } else {
      const fs = fitWidth("Preço não informado", bf, w * 0.86, plateH * 0.4, 6);
      els.push(<div key="np" style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), height: r1(plateH), border: `2px dashed ${lineFg}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(bf.family), fontWeight: 700, fontSize: fs, color: lineFg, boxSizing: "border-box" }}>Preço não informado</div>);
    }
    cy += plateH;
    const ta = align;
    if (sm.subs.length) {
      cy += gapBelow;
      sm.subs.forEach((s, i) => {
        els.push(<div key={`s${i}`} style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), fontFamily: fontStack(bf.family), fontWeight: 800, fontSize: r1(sm.subFs), lineHeight: 1.18, color: lineFg, textAlign: ta, whiteSpace: "nowrap" }}>{s.text}</div>);
        cy += sm.subFs * 1.22;
      });
    } else if (sm.xf) cy += gapBelow;
    if (sm.xf) {
      cy += sm.xf.fs * 0.2;
      const lines = sm.xf.lines.map((l, i) => (sm.xf!.truncated && i === sm.xf!.lines.length - 1 ? `${l.replace(/[\s·]+$/, "")}…` : l));
      els.push(
        <div key="x" style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), fontFamily: fontStack(bf.family), fontWeight: 700, fontSize: r1(sm.xf.fs), lineHeight: 1.15, color: lineFg, textAlign: ta }}>
          {lines.map((l, i) => <div key={i} style={{ whiteSpace: "nowrap" }}>{l}</div>)}
        </div>,
      );
    }
    return (
      <div key="price" data-ev-price={model.mode} role="img" aria-label={model.aria || "Preço não informado"} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h) }}>
        <div data-ev-price-inner="" data-ev-text="" style={{ position: "absolute", left: 0, top: 0, width: r1(w), height: r1(h), overflow: "hidden" }}>{els}</div>
      </div>
    );
  };
  return { h, plateW: shapeW, plateH, shape, model, render };
}

function OldChip({ x, y, fs, label, value, look, face }: { x: number; y: number; fs: number; label: string; value: string; look: Look3; face: Face }) {
  const fg = ensureContrast(look.price.oldFg, look.price.oldBg, 4.5);
  return (
    <div style={{ position: "absolute", left: r1(x), top: r1(y), height: r1(fs * 1.45), padding: `0 ${r1(fs * 0.45)}px`, background: look.price.oldBg, color: fg, borderRadius: r1(fs * 0.3), display: "flex", alignItems: "center", gap: r1(fs * 0.25), fontFamily: fontStack(face.family), fontWeight: 800, fontSize: r1(fs), lineHeight: 1, whiteSpace: "nowrap", boxShadow: `0 0 0 1px rgba(0,0,0,.3)` }}>
      <span>{label}</span>
      <s style={{ textDecorationColor: look.price.strike, textDecorationThickness: "0.16em" }}>{value}</s>
    </div>
  );
}
