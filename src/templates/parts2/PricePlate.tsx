// Placa de preço (v2) — o elemento de maior contraste da peça.
// Placa escura arredondada: "R$" pequeno, inteiro gigante, centavos sobrescritos, unidade abaixo dos centavos.
// Aba clara acima ("POR", "LEVE 3 POR", nome do clube, "A PARTIR DE 6 UN") e plaquinha com o preço
// anterior riscado ao lado (de/por). Linhas pequenas abaixo: preço normal, "sai X cada", limite, pagamento, condições.
import type { ReactElement } from "react";
import { priceParts } from "@/domain/money";
import type { Offer, Unit } from "@/domain/offer";
import { capOf, clamp, fitLines, fitWidth, fontStack, r1, textWidth, type Face } from "./measure";
import { priceModel2, type PriceModel2 } from "./offer2";
import { lighten, type Look } from "./look";
import { contrast, ensureContrast } from "../parts/color";

export interface PricePlan {
  /** altura efetivamente usada (px) */
  h: number;
  /** largura da placa (px) */
  plateW: number;
  model: PriceModel2;
  render: (x: number, y: number) => ReactElement;
}

export interface PriceOpts {
  scale?: number;
  align?: "left" | "center" | "right";
  maxExtras?: number;
  /** fundo onde ficam as linhas pequenas (para contraste) */
  onBg: string;
  onFg: string;
  plateBg?: string;
  plateFg?: string;
  /** limite do tamanho do inteiro (px) */
  maxF?: number;
}

const UNIT_FACE: Face = { family: "Inter", weight: 800 };

export function planPrice(offer: Offer, unit: Unit | null, look: Look, w: number, maxH: number, o: PriceOpts): PricePlan {
  const model = priceModel2(offer, unit);
  const pf = look.fonts.price;
  const lf = look.fonts.label;
  const bf = look.fonts.body;
  const scale = o.scale ?? 1;
  const align = o.align ?? "right";
  const plateBg = o.plateBg ?? look.plate.bg;
  const plateFg = ensureContrast(o.plateFg ?? look.plate.fg, plateBg, 4.5);
  const lineFg = ensureContrast(o.onFg, o.onBg, 4.5);
  const capP = capOf(pf);

  // ---------- linhas pequenas (dimensionadas pela altura disponível)
  let sFs = clamp(maxH * 0.105, 6.5, 40) * Math.min(1.15, scale);
  const extras = model.extras.slice(0, o.maxExtras ?? 2);
  const build = (k: number) => {
    const s = sFs * k;
    // aba + preço anterior
    let rowH = 0, tabFs = 0, tabLines: string[] = [], tabW = 0, oldFs = 0, oldW = 0, oldSeparate = false;
    if (model.tab || model.old) {
      rowH = s * 1.75;
      if (model.tab) {
        tabFs = rowH * 0.58;
        const one = fitWidth(model.tab, lf, w * 0.97 - tabFs * 0.9, tabFs, 5.5);
        if (one >= tabFs * 0.62 || model.tab.length < 12) { tabFs = one; tabLines = [model.tab]; }
        else {
          // nome de clube longo: até 2 linhas, nunca cortado com reticências
          const f = fitLines(model.tab, lf, w * 0.97 - tabFs * 0.9, rowH * 1.5, { maxFs: tabFs * 0.95, minFs: 5.5, maxLines: 2, lineHeight: 1.08 });
          tabFs = f.fs; tabLines = f.truncated ? [model.tab] : f.lines;
          if (f.truncated) tabFs = fitWidth(model.tab, lf, w * 0.97 - tabFs * 0.9, tabFs, 4);
          rowH = Math.max(rowH, tabLines.length * tabFs * 1.08 + tabFs * 0.55);
        }
        tabW = Math.max(...tabLines.map((l) => textWidth(l, lf, tabFs))) + tabFs * 0.9;
      }
      if (model.old) {
        oldFs = Math.min(rowH * 0.5, s * 1.0);
        const oldText = `${model.old.label} ${model.old.value}`;
        const room = w - tabW - rowH * 0.25;
        const need = (f: number) => textWidth(oldText, bf, f) + f * 0.9;
        if (need(oldFs) > room) {
          const f2 = fitWidth(oldText, bf, room - oldFs * 0.9, oldFs, 5.5);
          if (f2 >= oldFs * 0.7) oldFs = f2;
          else { oldSeparate = true; oldFs = Math.min(oldFs, fitWidth(oldText, bf, w * 0.96, oldFs, 5.5)); }
        }
        oldW = need(oldFs);
      }
    }
    const subFs = model.subs.length ? Math.min(...model.subs.map((x) => fitWidth(x.text, bf, w, s * 0.95, 5.5))) : 0;
    const subs = model.subs.map((x) => (subFs < s * 0.75 ? { text: x.short } : { text: x.text }));
    const subFs2 = subs.length ? Math.min(s * 0.95, ...subs.map((x) => fitWidth(x.text, bf, w, s * 0.95, 5.5))) : 0;
    const xText = extras.join(" · ");
    const xf = xText ? fitLines(xText, bf, w, s * 0.85 * 2.3, { maxFs: s * 0.82, minFs: 5.5, maxLines: 2, lineHeight: 1.15 }) : null;
    const oldRowH = oldSeparate ? oldFs * 1.5 : 0;
    const smallH = rowH + oldRowH + subs.length * subFs2 * 1.22 + (xf ? xf.lines.length * xf.fs * 1.15 + xf.fs * 0.2 : 0);
    return { rowH, tabFs, tabLines, tabW, oldFs, oldW, oldSeparate, oldRowH, subs, subFs: subFs2, xf, smallH };
  };
  let sm = build(1);
  const budget = maxH * (model.cents == null ? 0.55 : 0.46);
  if (sm.smallH > budget) sm = build(Math.max(0.55, budget / sm.smallH));
  const plateMaxH = Math.max(10, maxH - sm.smallH - (sm.subs.length || sm.xf ? maxH * 0.02 : 0));

  // ---------- placa
  let F = 0, plateW = w, plateH = plateMaxH, intW = 0, curW = 0, colW = 0, centsW = 0;
  const parts = model.cents != null ? priceParts(model.cents) : null;
  if (parts) {
    curW = textWidth("R$", pf, 0.3);
    intW = textWidth(parts.integer, pf, 1);
    centsW = textWidth(`,${parts.decimal}`, pf, 0.46);
    colW = Math.max(centsW, model.suffix ? textWidth(model.suffix, UNIT_FACE, 0.2) : 0);
    const content = curW + 0.06 + intW + 0.05 + colW;
    const padX = 0.14, padY = 0.11;
    F = Math.min(plateMaxH / (capP + 2 * padY), w / (content + 2 * padX), o.maxF ?? Infinity);
    plateW = Math.max(F * (content + 2 * padX), Math.min(w, sm.tabW));
    plateH = F * (capP + 2 * padY);
  } else {
    plateH = Math.min(plateMaxH, Math.max(18, w * 0.22));
  }
  const usedH = sm.rowH + sm.oldRowH + plateH + (sm.subs.length ? sm.subs.length * sm.subFs * 1.22 + maxH * 0.02 : 0) + (sm.xf ? sm.xf.lines.length * sm.xf.fs * 1.15 + sm.xf.fs * 0.2 : 0);
  const h = Math.min(maxH, usedH);
  const plateX = align === "left" ? 0 : align === "center" ? (w - plateW) / 2 : w - plateW;

  const render = (x: number, y: number): ReactElement => {
    let cy = 0;
    const els: ReactElement[] = [];
    // separado: preço anterior numa linha própria acima da aba
    if (sm.oldSeparate && model.old) {
      els.push(<OldPlate key="old" x={align === "left" ? 0 : align === "center" ? (w - sm.oldW) / 2 : w - sm.oldW} y={cy + sm.oldFs * 0.15} fs={sm.oldFs} label={model.old.label} value={model.old.value} look={look} face={bf} />);
      cy += sm.oldRowH;
    }
    if (sm.rowH) {
      const rad = Math.min(plateH, plateW) * 0.16;
      const sideOld = !!model.old && !sm.oldSeparate;
      const tabX = clamp(plateX + rad * 0.75, 0, Math.max(0, sideOld ? w - sm.oldW - sm.tabW - sm.rowH * 0.25 : w - sm.tabW));
      if (model.tab) {
        // aba some no fundo do card (ex.: aba dourada em card dourado): inverte para a cor da placa
        const swap = contrast(look.plate.tabBg, o.onBg) < 1.6;
        const tbg = swap ? plateBg : look.plate.tabBg;
        const tfg = ensureContrast(swap ? look.plate.tabBg : look.plate.tabFg, tbg, 4.5);
        els.push(
          <div key="tab" style={{ position: "absolute", left: r1(tabX), top: r1(cy + sm.rowH * 0.08), width: r1(sm.tabW), height: r1(sm.rowH * 0.92 + 1), background: tbg, color: tfg, borderRadius: `${r1(sm.tabFs * 0.4)}px ${r1(sm.tabFs * 0.4)}px 0 0`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: fontStack(lf.family), fontWeight: lf.weight, fontStyle: lf.italic ? "italic" : undefined, fontSize: sm.tabFs, lineHeight: 1.08, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
            {sm.tabLines.map((l, i) => <span key={i}>{l}</span>)}
          </div>,
        );
      }
      if (model.old && !sm.oldSeparate) {
        const ox = model.tab ? Math.min(w - sm.oldW, Math.max(tabX + sm.tabW + sm.rowH * 0.2, plateX + plateW - sm.oldW)) : Math.max(0, plateX + plateW - sm.oldW);
        els.push(<OldPlate key="old" x={ox} y={cy + (sm.rowH - sm.oldFs * 1.45) / 2} fs={sm.oldFs} label={model.old.label} value={model.old.value} look={look} face={bf} />);
      }
      cy += sm.rowH;
    }
    // placa
    if (parts) {
      const padX = F * 0.14, padY = F * 0.11;
      const top = padY;
      const xInt = padX + curW * F + F * 0.06;
      const xCol = xInt + intW * F + F * 0.05;
      const off = Math.max(0, (plateW - F * (curW + 0.06 + intW + 0.05 + colW + 0.28)) / 2);
      els.push(
        <div key="plate" style={{ position: "absolute", left: r1(plateX), top: r1(cy), width: r1(plateW), height: r1(plateH), borderRadius: r1(Math.min(plateH, plateW) * 0.16), background: `linear-gradient(180deg, ${lighten(plateBg, 0.14)} 0%, ${plateBg} 42%, ${plateBg} 100%)`, boxShadow: `0 ${r1(F * 0.05)}px 0 rgba(0,0,0,.35)${look.plate.edge ? `, inset 0 0 0 ${r1(Math.max(1.5, F * 0.035))}px ${look.plate.edge}` : ""}` }}>
          <svg aria-hidden="true" width={r1(plateW)} height={r1(plateH)} viewBox={`0 0 ${r1(plateW)} ${r1(plateH)}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <g fill={plateFg} fontFamily={fontStack(pf.family)} fontWeight={pf.weight} fontStyle={pf.italic ? "italic" : undefined}>
              <text x={r1(padX + off)} y={r1(top + capP * F * 0.3)} fontSize={r1(F * 0.3)} textLength={r1(curW * F)} lengthAdjust="spacingAndGlyphs">R$</text>
              <text x={r1(xInt + off)} y={r1(top + capP * F)} fontSize={r1(F)} textLength={r1(intW * F)} lengthAdjust="spacingAndGlyphs">{parts.integer}</text>
              <text x={r1(xCol + off)} y={r1(top + capP * F * 0.46)} fontSize={r1(F * 0.46)} textLength={r1(centsW * F)} lengthAdjust="spacingAndGlyphs">,{parts.decimal}</text>
            </g>
            {model.suffix && (
              <text x={r1(xCol + off)} y={r1(top + capP * F)} fontSize={r1(F * 0.2)} fill={plateFg} fontFamily={fontStack(UNIT_FACE.family)} fontWeight={UNIT_FACE.weight} opacity={0.92}>{model.suffix}</text>
            )}
          </svg>
        </div>,
      );
    } else {
      const fs = fitWidth("Preço não informado", bf, w * 0.86, plateH * 0.4, 6);
      els.push(<div key="np" style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), height: r1(plateH), border: `2px dashed ${lineFg}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(bf.family), fontWeight: 700, fontSize: fs, color: lineFg }}>Preço não informado</div>);
    }
    cy += plateH;
    const ta = align === "left" ? "left" : align === "center" ? "center" : "right";
    if (sm.subs.length) {
      cy += maxH * 0.02;
      sm.subs.forEach((s, i) => {
        els.push(<div key={`s${i}`} style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), fontFamily: fontStack(bf.family), fontWeight: 800, fontSize: r1(sm.subFs), lineHeight: 1.18, color: lineFg, textAlign: ta, whiteSpace: "nowrap" }}>{s.text}</div>);
        cy += sm.subFs * 1.22;
      });
    }
    if (sm.xf) {
      cy += sm.xf.fs * 0.2;
      const lines = sm.xf.lines.map((l, i) => (sm.xf!.truncated && i === sm.xf!.lines.length - 1 ? `${l.replace(/[\s·]+$/, "")}…` : l));
      els.push(
        <div key="x" style={{ position: "absolute", left: 0, top: r1(cy), width: r1(w), fontFamily: fontStack(bf.family), fontWeight: 700, fontSize: r1(sm.xf.fs), lineHeight: 1.15, color: lineFg, textAlign: ta, opacity: 0.92 }}>
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
  return { h, plateW, model, render };
}

function OldPlate({ x, y, fs, label, value, look, face }: { x: number; y: number; fs: number; label: string; value: string; look: Look; face: Face }) {
  const fg = ensureContrast(look.plate.oldFg, look.plate.oldBg, 4.5);
  return (
    <div style={{ position: "absolute", left: r1(x), top: r1(y), height: r1(fs * 1.45), padding: `0 ${r1(fs * 0.45)}px`, background: look.plate.oldBg, color: fg, borderRadius: r1(fs * 0.3), display: "flex", alignItems: "center", gap: r1(fs * 0.25), fontFamily: fontStack(face.family), fontWeight: 800, fontSize: r1(fs), lineHeight: 1, whiteSpace: "nowrap", boxShadow: "0 0 0 1px rgba(0,0,0,.28), 0 1px 0 rgba(0,0,0,.25)" }}>
      <span>{label}</span>
      <s style={{ textDecorationColor: look.plate.strike, textDecorationThickness: "0.16em" }}>{value}</s>
    </div>
  );
}
