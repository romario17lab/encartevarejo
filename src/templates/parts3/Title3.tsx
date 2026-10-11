// Título em camadas (v3), gerado por código a partir do título da campanha (texto editável):
//  - modo "faixa": palavra principal grande na cor de destaque, as demais palavras numa faixa inclinada
//    (ou numa linha menor acima), letra sem serifa pesada com contorno sólido e sombra dura (sem desfoque);
//  - modo "cursiva": as palavras de apoio numa itálica caligráfica (Playfair Display Italic, licença OFL,
//    empacotada em @fontsource) sobre a palavra principal condensada.
// A ordem de leitura das palavras é sempre preservada.
import type { ReactElement } from "react";
import { capOf, fontStack, textWidth, type Face } from "../parts2/measure";
import type { TitleStyle3 } from "./look3";

const r1 = (n: number) => Math.round(n * 10) / 10;
const CONNECTORS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "NA", "NO", "NAS", "NOS", "EM", "A", "O", "AS", "OS", "À", "AO", "COM", "PRA", "PARA", "&", "+"]);
const OW = 0.075; // contorno (em)
const SO = 0.085; // sombra dura (em)

interface Row { kind: "key" | "plain" | "band" | "script"; text: string; face: Face; fs: number; w: number; h: number }

function keyIndex(words: string[], style: TitleStyle3): number {
  const k = style.keyWord ? style.keyWord(words.map((w) => w.toLocaleUpperCase("pt-BR"))) : -1;
  if (k >= 0 && k < words.length) return k;
  let best = -1;
  words.forEach((w, i) => { const u = w.toLocaleUpperCase("pt-BR"); if (!CONNECTORS.has(u) && (best < 0 || u.length > words[best].length)) best = i; });
  return Math.max(0, best);
}

/** Linhas do título (texto, papel) na ordem de leitura. */
export function titleRows(text: string, style: TitleStyle3, single: boolean): Array<{ kind: Row["kind"]; text: string }> {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const up = (s: string) => s.toLocaleUpperCase("pt-BR");
  if (single) return [{ kind: "key", text: up(words.join(" ")) }];
  const k = keyIndex(words, style);
  const pre = words.slice(0, k).join(" ");
  const post = words.slice(k + 1).join(" ");
  const key = up(words[k]);
  if (style.mode === "cursiva") {
    const rows: Array<{ kind: Row["kind"]; text: string }> = [];
    if (pre) rows.push({ kind: "script", text: pre });
    rows.push({ kind: "key", text: key });
    if (post) rows.push({ kind: "script", text: post });
    return rows;
  }
  if (pre && post) return [{ kind: "plain", text: up(pre) }, { kind: "key", text: key }, { kind: "band", text: up(post) }];
  if (pre) return [{ kind: "band", text: up(pre) }, { kind: "key", text: key }];
  if (post) return [{ kind: "key", text: key }, { kind: "band", text: up(post) }];
  return [{ kind: "key", text: key }];
}

const BAND_PADX = 0.45, BAND_PADY = 0.22;

function rowWidth(kind: Row["kind"], text: string, face: Face, fs: number): number {
  const tw = textWidth(text, face, fs);
  if (kind === "band") return tw + fs * BAND_PADX * 2 + fs * SO;
  return tw + fs * (OW * 2 + SO);
}
function rowHeight(kind: Row["kind"], face: Face, fs: number, angle: number, w: number): number {
  const cap = capOf(face);
  if (kind === "band") return fs * (cap + BAND_PADY * 2 + SO) + Math.abs(Math.sin((angle * Math.PI) / 180)) * w;
  if (kind === "script") return fs * (capOf(face) + 0.32 + OW * 2 + SO); // descendentes da cursiva
  return fs * (cap + OW * 2 + SO);
}

/** Planeja tamanhos: a palavra principal é o maior elemento; as demais linhas 38–55% dela. */
export function planTitle3(text: string, style: TitleStyle3, w: number, h: number, single = false, horizontal = false): { rows: Row[]; height: number; keyFs: number } {
  const spec = titleRows(text, style, single);
  const ratio: Record<Row["kind"], number> = horizontal ? { key: 1, plain: 0.55, band: 0.5, script: 0.75 } : { key: 1, plain: 0.42, band: 0.4, script: 0.58 };
  const faceOf = (k: Row["kind"]) => (k === "script" ? style.script : style.face);
  if (horizontal) {
    // tudo numa linha: [apoio] PRINCIPAL [faixa] — para cabeçalhos muito largos (TV, banner)
    const mk = (kf: number): Row[] => spec.map((r) => { const face = faceOf(r.kind); const fs = kf * ratio[r.kind]; const rw = rowWidth(r.kind, r.text, face, fs); return { kind: r.kind, text: r.text, face, fs, w: rw, h: rowHeight(r.kind, face, fs, style.angle, rw) }; });
    const unit = mk(1);
    const kw = (w * 0.98) / (unit.reduce((s, r) => s + r.w, 0) + 0.22 * (unit.length - 1));
    const kh = h / Math.max(...unit.map((r) => r.h));
    const rows = mk(Math.min(kw, kh));
    return { rows, height: Math.max(...rows.map((r) => r.h)), keyFs: rows.find((r) => r.kind === "key")?.fs ?? 0 };
  }
  // tamanho da principal limitado pela largura de cada linha (linha secundária ajusta a própria largura)
  let keyFs = Infinity;
  for (const r of spec) {
    const one = rowWidth(r.kind, r.text, faceOf(r.kind), 1);
    const maxByW = (w * (r.kind === "key" ? 1 : 0.98)) / one;
    keyFs = Math.min(keyFs, r.kind === "key" ? maxByW : maxByW / (ratio[r.kind] * 0.55)); // secundárias podem encolher até 55% do ideal
  }
  const build = (kf: number): Row[] => spec.map((r) => {
    const face = faceOf(r.kind);
    let fs = kf * ratio[r.kind];
    const one = rowWidth(r.kind, r.text, face, 1);
    fs = Math.min(fs, (w * 0.98) / one);
    const rw = rowWidth(r.kind, r.text, face, fs);
    return { kind: r.kind, text: r.text, face, fs, w: rw, h: rowHeight(r.kind, face, fs, style.angle, rw) };
  });
  let rows = build(keyFs);
  const total = (rs: Row[]) => rs.reduce((s, r, i) => s + r.h * (r.kind === "script" && i > 0 ? 0.78 : 1), 0);
  const H = total(rows);
  if (H > h) rows = build(keyFs * (h / H) * 0.995);
  for (let i = 0; i < 4 && total(rows) > h; i++) rows = build(rows[0] ? (rows.find((r) => r.kind === "key")!.fs * 0.97) : 1);
  return { rows, height: total(rows), keyFs: rows.find((r) => r.kind === "key")?.fs ?? 0 };
}

function StrokedText({ x, y, text, face, fs, fill, outline, shadow, width, anchor = "middle" }: { x: number; y: number; text: string; face: Face; fs: number; fill: string; outline: string; shadow: string; width: number; anchor?: "middle" | "start" }) {
  const common = { x: r1(x), y: r1(y), fontSize: r1(fs), fontFamily: fontStack(face.family), fontWeight: face.weight, fontStyle: face.italic ? "italic" : undefined, textAnchor: anchor, textLength: r1(width), lengthAdjust: "spacingAndGlyphs" as const, strokeLinejoin: "round" as const };
  return (
    <g>
      <text {...common} transform={`translate(${r1(fs * SO)} ${r1(fs * SO)})`} fill={shadow} stroke={shadow} strokeWidth={r1(fs * OW * 2)}>{text}</text>
      <text {...common} fill={outline} stroke={outline} strokeWidth={r1(fs * OW * 2)}>{text}</text>
      <text {...common} fill={fill}>{text}</text>
    </g>
  );
}

export function Title3({ text, x, y, w, h, style, single = false, valign = "center" }: { text: string; x: number; y: number; w: number; h: number; style: TitleStyle3; single?: boolean; valign?: "center" | "top" }): ReactElement {
  const horizontal = !single && w / Math.max(1, h) > 5 && titleRows(text, style, false).length > 1;
  const plan = planTitle3(text, style, w, h, single, horizontal);
  const els: ReactElement[] = [];
  const drawRow = (r: Row, i: number, cx: number, cy: number, overlapPrev: boolean) => {
    const cap = capOf(r.face);
    const tw = textWidth(r.text, r.face, r.fs);
    if (r.kind === "band") {
      const bw = tw + r.fs * BAND_PADX * 2, bh = r.fs * (cap + BAND_PADY * 2);
      const skew = bh * 0.25;
      const top = cy + Math.abs(Math.sin((style.angle * Math.PI) / 180)) * r.w / 2;
      const bx = cx - bw / 2;
      const poly = (dx: number, dy: number) => `${r1(bx + skew + dx)},${r1(top + dy)} ${r1(bx + bw + dx)},${r1(top + dy)} ${r1(bx + bw - skew + dx)},${r1(top + bh + dy)} ${r1(bx + dx)},${r1(top + bh + dy)}`;
      els.push(
        <g key={i} transform={`rotate(${style.angle} ${r1(cx)} ${r1(top + bh / 2)})`}>
          <polygon points={poly(r.fs * SO, r.fs * SO)} fill={style.shadow} />
          <polygon points={poly(0, 0)} fill={style.bandBg} stroke={style.outline} strokeWidth={r1(r.fs * 0.06)} strokeLinejoin="round" />
          <text x={r1(cx)} y={r1(top + bh / 2 + (cap * r.fs) / 2)} fontSize={r1(r.fs)} fontFamily={fontStack(r.face.family)} fontWeight={r.face.weight} textAnchor="middle" textLength={r1(tw)} lengthAdjust="spacingAndGlyphs" fill={style.bandFg}>{r.text}</text>
        </g>,
      );
      return;
    }
    const top = overlapPrev ? cy - r.h * 0.22 : cy;
    const base = top + r.fs * (OW + cap);
    const fill = r.kind === "key" ? style.keyFill : r.kind === "script" ? style.scriptFill : style.fill;
    els.push(<StrokedText key={i} x={cx - (r.fs * SO) / 2} y={base} text={r.text} face={r.face} fs={r.fs} fill={fill} outline={style.outline} shadow={style.shadow} width={tw} />);
  };
  if (horizontal) {
    const gap = plan.keyFs * 0.22;
    const total = plan.rows.reduce((s, r) => s + r.w, 0) + gap * (plan.rows.length - 1);
    let cx = (w - total) / 2;
    plan.rows.forEach((r, i) => { drawRow(r, i, cx + r.w / 2, (h - r.h) / 2, false); cx += r.w + gap; });
  } else {
    let cy = valign === "top" ? 0 : (h - plan.height) / 2;
    plan.rows.forEach((r, i) => {
      const ov = r.kind === "script" && i > 0;
      drawRow(r, i, w / 2, cy, ov);
      cy += ov ? r.h * 0.78 : r.h;
    });
  }
  return (
    <h1 data-ev-title="" aria-label={text} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), margin: 0, fontSize: r1(Math.max(1, plan.keyFs * 0.4)), lineHeight: 1, overflow: "hidden" }}>
      <svg aria-hidden="true" width={r1(w)} height={r1(h)} viewBox={`0 0 ${r1(w)} ${r1(h)}`} style={{ display: "block", overflow: "visible" }}>{els}</svg>
    </h1>
  );
}
