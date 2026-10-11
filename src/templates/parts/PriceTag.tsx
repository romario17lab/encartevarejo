// Etiqueta de preço compartilhada por todos os modelos.
// Renderiza TODAS as mecânicas de src/domain/offer.ts a partir de dados estruturados:
//   simple · from_to (De R$ x por, preço anterior riscado + selo de %) · min_qty · combo · club
//   + limite por cliente, observação de pagamento e condições.
// O "R$", os reais (grandes) e os centavos (sobrescritos) ficam bem distintos.
import type { CSSProperties, ReactElement } from "react";
import { describeOffer, UNITS, type Offer, type Unit } from "@/domain/offer";
import { discountPercent, formatBRL, priceParts } from "@/domain/money";
import { metricsOf, fontStack } from "./metrics";
import { clamp, fitOneLine, round } from "./text";
import { alpha, ensureContrast, readableOn } from "./color";
import type { FontRole, PriceShape, Skin } from "./types";

const MEASURE_UNITS = new Set<Unit>(["kg", "g", "100g", "l", "ml", "m", "m2"]);

/** Sufixo de unidade exibido ao lado do preço: "/kg", "un", "cada", "pct"... */
export function unitSuffix(unit: Unit | null, mode: Offer["mode"]): string | null {
  if (!unit) return mode === "min_qty" ? "cada" : null;
  if (MEASURE_UNITS.has(unit)) return `/${UNITS[unit].short}`;
  if (mode === "min_qty") return "cada";
  return UNITS[unit].short;
}

export interface PriceModel {
  pre: { text: string; strike?: string; post?: string; short?: string } | null;
  chip: string | null;
  cents: number | null;
  suffix: string | null;
  subs: Array<{ text: string; short: string }>;
  extras: string[];
  discount: number;
  aria: string;
}

/** Converte a oferta em linhas de exibição. Nunca inventa valores: campos ausentes ficam ausentes. */
export function priceModel(offer: Offer, unit: Unit | null): PriceModel {
  const sfx = unitSuffix(unit, offer.mode);
  const countWord = unit && !MEASURE_UNITS.has(unit) ? UNITS[unit].short : unit ? UNITS[unit].short : "un";
  const m: PriceModel = { pre: null, chip: null, cents: offer.priceCents, suffix: sfx, subs: [], extras: [], discount: 0, aria: describeOffer(offer, unit) };
  switch (offer.mode) {
    case "simple":
      break;
    case "from_to":
      if (offer.regularCents != null) {
        m.pre = { text: "De", strike: formatBRL(offer.regularCents), post: "por" };
        if (offer.priceCents != null) m.discount = discountPercent(offer.regularCents, offer.priceCents);
      }
      break;
    case "min_qty":
      if (offer.minQty) m.pre = { text: `A partir de ${offer.minQty} ${countWord}` };
      if (offer.regularCents != null) m.subs.push({ text: `Preço normal ${formatBRL(offer.regularCents)}`, short: `Normal ${formatBRL(offer.regularCents)}` });
      break;
    case "combo": {
      m.cents = offer.comboCents;
      m.suffix = null;
      if (offer.comboQty) m.pre = { text: `Leve ${offer.comboQty} por` };
      // "sai a X cada" só quando a divisão é exata (sem arredondar a favor da loja)
      if (offer.comboCents != null && offer.comboQty && offer.comboCents % offer.comboQty === 0)
        m.subs.push({ text: `Sai ${formatBRL(offer.comboCents / offer.comboQty)} cada`, short: `${formatBRL(offer.comboCents / offer.comboQty)} cada` });
      if (offer.regularCents != null) m.subs.push({ text: `Unidade ${formatBRL(offer.regularCents)}`, short: `Un. ${formatBRL(offer.regularCents)}` });
      break;
    }
    case "club":
      m.cents = offer.clubCents;
      m.chip = offer.clubName?.trim() || "Preço de clube";
      if (offer.priceCents != null) {
        const per = sfx && sfx.startsWith("/") ? sfx : "";
        m.pre = { text: `Preço normal ${formatBRL(offer.priceCents)}${per}`, short: `Normal ${formatBRL(offer.priceCents)}${per}` };
      }
      break;
  }
  if (offer.limitPerCustomer) m.extras.push(`Limite de ${offer.limitPerCustomer} por cliente`);
  if (offer.paymentNote) m.extras.push(offer.paymentNote);
  if (offer.conditions) m.extras.push(offer.conditions);
  return m;
}

/** Recuo interno do conteúdo para cada formato de etiqueta (frações de largura/altura). */
function shapeInset(shape: PriceShape, w: number, h: number) {
  switch (shape) {
    case "pill": return { l: Math.min(h * 0.34, w * 0.14), r: Math.min(h * 0.34, w * 0.14), t: h * 0.08, b: h * 0.08 };
    case "burst": return { l: w * 0.19, r: w * 0.19, t: h * 0.2, b: h * 0.2 };
    case "seal": return { l: w * 0.15, r: w * 0.15, t: h * 0.15, b: h * 0.15 };
    case "tag": return { l: w * 0.15, r: w * 0.06, t: h * 0.08, b: h * 0.08 };
    case "ribbon": return { l: w * 0.06, r: w * 0.11, t: h * 0.08, b: h * 0.08 };
    case "chalk": return { l: w * 0.07, r: w * 0.07, t: h * 0.09, b: h * 0.09 };
    case "plain": return { l: 0, r: 0, t: h * 0.02, b: h * 0.02 };
    default: return { l: w * 0.05, r: w * 0.05, t: h * 0.07, b: h * 0.07 };
  }
}

function ShapeBg({ shape, bg, w, h }: { shape: PriceShape; bg: string; w: number; h: number }) {
  const full: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  const r = Math.min(w, h);
  switch (shape) {
    case "plain": return null;
    case "band": return <div style={{ ...full, background: bg, borderRadius: r * 0.08 }} />;
    case "pill": return <div style={{ ...full, background: bg, borderRadius: h / 2 }} />;
    case "seal": return <div style={{ ...full, background: bg, borderRadius: "50%" }} />;
    case "chalk":
      return (
        <div style={{ ...full, background: bg, borderRadius: r * 0.06 }}>
          <div style={{ position: "absolute", inset: r * 0.035, border: `${Math.max(1, r * 0.012)}px dashed ${alpha(readableOn(bg), 0.45)}`, borderRadius: r * 0.04 }} />
        </div>
      );
    case "burst": {
      const pts: string[] = [];
      const n = 22;
      for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI * i) / n - Math.PI / 2;
        const rr = i % 2 === 0 ? 50 : 42.5;
        pts.push(`${round(50 + rr * Math.cos(a))},${round(50 + rr * Math.sin(a))}`);
      }
      return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={full} aria-hidden="true"><polygon points={pts.join(" ")} fill={bg} /></svg>;
    }
    case "tag":
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={full} aria-hidden="true">
          <path d="M11 0H97Q100 0 100 3V97Q100 100 97 100H11L0 50Z" fill={bg} />
        </svg>
      );
    case "ribbon":
      return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={full} aria-hidden="true"><path d="M0 0H100L93 50L100 100H0Z" fill={bg} /></svg>;
  }
}

export interface PriceTagProps {
  offer: Offer;
  unit: Unit | null;
  /** caixa disponível (px) relativa ao card */
  x: number; y: number; w: number; h: number;
  skin: Skin;
  /** substitui o formato da etiqueta (ex.: cartaz) */
  shape?: PriceShape;
  align?: "left" | "center" | "right";
  fontScale?: number;
  /** cores alternativas (ex.: card de destaque) */
  bg?: string; fg?: string;
  /** esconde condições extras (etiquetas muito pequenas) */
  maxExtras?: number;
}

export function PriceTag(p: PriceTagProps): ReactElement {
  const { offer, unit, skin } = p;
  const shape = p.shape ?? skin.price.shape;
  const bg = p.bg ?? skin.price.bg;
  // fundo efetivo atrás do texto: em "plain" o texto fica sobre o card
  const textBg = shape === "plain" ? skin.card.bg : bg;
  const fg = ensureContrast(p.fg ?? skin.price.fg, textBg, 3);
  const smallFg = ensureContrast(skin.price.smallFg ?? fg, textBg, 4.5);
  const align = p.align ?? skin.price.align;
  const model = priceModel(offer, unit);
  // selo: mantém proporção de elipse suave (no máx. 1,6:1)
  if (shape === "seal" && p.w > p.h * 1.6) {
    const nw = p.h * 1.6;
    const dx = align === "left" ? 0 : align === "right" ? p.w - nw : (p.w - nw) / 2;
    return <PriceTag {...p} x={p.x + dx} w={nw} />;
  }
  const ins = shapeInset(shape, p.w, p.h);
  const W = Math.max(10, p.w - ins.l - ins.r);
  const H = Math.max(10, p.h - ins.t - ins.b);
  const pf: FontRole = skin.fonts.price;
  const bf: FontRole = skin.fonts.body;
  const pm = metricsOf(pf.family);
  const scale = p.fontScale ?? 1;

  // ---- linhas pequenas
  const maxExtras = p.maxExtras ?? 2;
  const extras = model.extras.slice(0, maxExtras);
  let sFs = clamp(H * 0.115, 7, 40) * Math.min(1.1, scale);
  const fitSmall = (t: string, fs: number) => fitOneLine(t, W, fs, { family: bf.family, minFs: 6 });
  // textos alternativos curtos quando o espaço é pequeno (nunca reticências em valores)
  if (model.pre?.short) {
    const full = fitSmall(model.pre.text, sFs * 1.08);
    if (full < sFs * 0.8) model.pre = { text: model.pre.short };
  }
  model.subs = model.subs.map((s) => (fitSmall(s.text, sFs * 0.92) < sFs * 0.75 ? { text: s.short, short: s.short } : s));
  const preText = model.pre ? `${model.pre.text} ${model.pre.strike ?? ""} ${model.pre.post ?? ""}`.trim() : "";
  let preFs = model.pre ? fitSmall(preText, sFs * 1.08) : 0;
  let chipFs = model.chip ? fitOneLine(model.chip.toUpperCase(), W * 0.88, sFs, { family: bf.family, upper: true, minFs: 6 }) : 0;
  let subFs = model.subs.length ? Math.min(...model.subs.map((s) => fitSmall(s.text, sFs * 0.92))) : 0;
  let xFs = extras.length ? Math.min(...extras.map((s) => fitOneLine(s, W * 1.9, sFs * 0.82, { family: bf.family, minFs: 6 }))) : 0; // até 2 linhas
  const extrasLines = () => (extras.length ? Math.min(2, Math.ceil((extras.join(" · ").length * metricsOf(bf.family).avg * 1.12 * xFs) / W)) : 0);
  const smallH = () => preFs * 1.25 + chipFs * 1.75 + model.subs.length * subFs * 1.2 + extrasLines() * xFs * 1.2;
  const budget = H * (model.cents == null ? 0.6 : 0.5);
  if (smallH() > budget) {
    const k = budget / smallH();
    preFs *= k; chipFs *= k; subFs *= k; xFs *= k; sFs *= k;
  }
  const mainH = H - smallH();

  // ---- preço principal
  let main: ReactElement;
  if (model.cents == null) {
    const fs = fitOneLine("Preço não informado", W, Math.max(8, mainH * 0.3), { family: bf.family, minFs: 6 });
    main = <div style={{ fontFamily: fontStack(bf.family), fontWeight: 700, fontSize: fs, lineHeight: 1.1, border: `1px dashed ${fg}`, padding: "0.2em 0.4em", color: fg }}>Preço não informado</div>;
  } else {
    const parts = priceParts(model.cents);
    const intW = parts.integer.split("").reduce((s, ch) => s + (ch === "." ? pm.comma : pm.digit), 0);
    const cur = 0.3 * pm.currency;
    const decW = 0.46 * (pm.comma + 2 * pm.digit);
    const sfxW = model.suffix ? 0.24 * model.suffix.length * metricsOf(bf.family).avg * 1.15 : 0;
    const factor = (cur + 0.07 + intW + 0.05 + Math.max(decW, sfxW)) * 1.06;
    const F = round(Math.max(8, Math.min(mainH * 0.98, W / factor, H)));
    const pfStyle: CSSProperties = { fontVariantNumeric: "lining-nums", fontFamily: fontStack(pf.family), fontWeight: pf.weight, fontStyle: pf.italic ? "italic" : undefined, color: fg };
    main = (
      <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-start", lineHeight: 1, height: F, overflow: "clip", flex: "none", ...pfStyle }}>
        <span style={{ fontSize: round(F * 0.3), marginTop: round(F * 0.1), marginRight: round(F * 0.07) }}>{parts.currency}</span>
        <span style={{ fontSize: F, letterSpacing: "-0.02em" }}>{parts.integer}</span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginLeft: round(F * 0.04), height: F, justifyContent: "space-between" }}>
          <span style={{ fontSize: round(F * 0.46), lineHeight: 1 }}>,{parts.decimal}</span>
          {model.suffix && (
            <span style={{ fontSize: round(F * 0.24), lineHeight: 1, fontFamily: fontStack(bf.family), fontWeight: 700, paddingBottom: round(F * 0.05) }}>{model.suffix}</span>
          )}
        </span>
      </div>
    );
  }

  const justify = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const textAlign = align;
  const bodyStyle: CSSProperties = { fontVariantNumeric: "lining-nums", fontFamily: fontStack(bf.family), color: smallFg, lineHeight: 1.18, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" };
  const chipBg = skin.price.chipBg;
  const chipFg = ensureContrast(skin.price.chipFg, chipBg, 4.5);

  return (
    <div data-ev-price={offer.mode} role="img" aria-label={model.aria || "Preço não informado"}
      style={{ position: "absolute", left: round(p.x), top: round(p.y), width: round(p.w), height: round(p.h) }}>
      <ShapeBg shape={shape} bg={bg} w={p.w} h={p.h} />
      <div data-ev-price-inner="" data-ev-text="" style={{ position: "absolute", left: round(ins.l), top: round(ins.t), width: round(W), height: round(H), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: justify, textAlign, overflow: "hidden" }}>
        {model.pre && (
          <div style={{ ...bodyStyle, fontSize: round(preFs), fontWeight: 700 }}>
            {model.pre.text}
            {model.pre.strike && (
              <>
                {" "}
                <s style={{ textDecorationColor: skin.price.strike, textDecorationThickness: "0.14em" }}>{model.pre.strike}</s>
              </>
            )}
            {model.pre.post ? ` ${model.pre.post}` : ""}
          </div>
        )}
        {model.chip && (
          <div style={{ ...bodyStyle, color: chipFg, background: chipBg, fontSize: round(chipFs), fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em", padding: `${round(chipFs * 0.18)}px ${round(chipFs * 0.5)}px`, borderRadius: round(chipFs * 0.4), margin: `${round(chipFs * 0.12)}px 0` }}>
            {model.chip}
          </div>
        )}
        {main}
        {model.subs.map((s) => (
          <div key={s.text} style={{ ...bodyStyle, fontSize: round(subFs), fontWeight: 600 }}>{s.text}</div>
        ))}
        {extras.length > 0 && (
          <div style={{ fontFamily: fontStack(bf.family), color: smallFg, fontSize: round(xFs), lineHeight: 1.18, fontWeight: 600, maxWidth: "100%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "break-word" }}>
            {extras.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

/** Selo "-28%" (apenas quando o preço anterior foi informado: calculado por discountPercent). */
export function DiscountBadge({ pct, x, y, size, skin }: { pct: number; x: number; y: number; size: number; skin: Skin }) {
  if (pct <= 0) return null;
  const { bg, shape } = skin.badge;
  const fg = ensureContrast(skin.badge.fg, bg, 4.5);
  const text = `-${pct}%`;
  const w = shape === "tab" ? size * 1.35 : size;
  const h = shape === "tab" ? size * 0.62 : size;
  const fs = fitOneLine(text, w * (shape === "tab" ? 0.86 : 0.7), size * 0.34, { family: skin.fonts.price.family });
  let bgEl: ReactElement;
  if (shape === "burst") {
    const pts: string[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (Math.PI * i) / 14;
      const rr = i % 2 === 0 ? 50 : 41;
      pts.push(`${round(50 + rr * Math.cos(a))},${round(50 + rr * Math.sin(a))}`);
    }
    bgEl = <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true"><polygon points={pts.join(" ")} fill={bg} /></svg>;
  } else {
    bgEl = <div style={{ position: "absolute", inset: 0, background: bg, borderRadius: shape === "circle" ? "50%" : h * 0.22 }} />;
  }
  return (
    <div data-ev-badge="desconto" aria-label={`${pct}% de desconto`} style={{ position: "absolute", left: round(x - w), top: round(y), width: round(w), height: round(h), transform: shape === "tab" ? undefined : "rotate(-8deg)" }}>
      {bgEl}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: fg, fontFamily: fontStack(skin.fonts.price.family), fontWeight: skin.fonts.price.weight, fontSize: fs, lineHeight: 1 }}>{text}</div>
    </div>
  );
}
