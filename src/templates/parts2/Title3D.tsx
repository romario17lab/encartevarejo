// Título como ilustração (v2): letras condensadas com volume (extrusão), contorno duplo e sombra;
// a palavra principal em degradê quente e o resto em branco; conectores ("de", "da", "e") em círculos.
// Todo o texto vem da campanha. Ajuste automático à caixa (larguras medidas por caractere).
import type { ReactElement } from "react";
import { capOf, fontStack, textWidth, type Face } from "./measure";
import { hid, type TitleStyle } from "./look";

const CONNECTORS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "NA", "NO", "NAS", "NOS", "EM", "A", "O", "AS", "OS", "À", "AO", "COM", "PRA", "PARA", "&", "+", "Y"]);
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Tok { text: string; conn: boolean; key: boolean }
type Unit = Tok[];

// medidas em "em" (relativas ao tamanho da fonte da linha)
const CIRCLE = 0.6;
const GAP_WORD = 0.2;
const GAP_CONN = 0.08;
const INNER = 0.09; // largura do traço do contorno interno (metade aparece)
const OUTER = 0.24; // largura do traço do contorno externo
const LABEL: Face = { family: "Inter", weight: 900 };

function unitWidth(u: Unit, face: Face): number {
  let w = 0;
  u.forEach((t, i) => {
    if (i > 0) w += t.conn || u[i - 1].conn ? GAP_CONN : GAP_WORD;
    w += t.conn ? CIRCLE : textWidth(t.text, face, 1);
  });
  return w;
}

function lineWidth(units: Unit[], face: Face): number {
  return units.reduce((s, u, i) => s + unitWidth(u, face) + (i > 0 ? (u[0].conn ? GAP_CONN * 1.5 : GAP_WORD) : 0), 0);
}

export function splitTitle(text: string, keyWord?: (words: string[]) => number): Tok[] {
  const words = text.trim().toLocaleUpperCase("pt-BR").split(/\s+/).filter(Boolean);
  let key = keyWord ? keyWord(words) : -1;
  if (key < 0 || key >= words.length) {
    let best = -1;
    words.forEach((w, i) => { if (!CONNECTORS.has(w) && (best < 0 || w.length >= words[best].length)) best = i; });
    key = best;
  }
  // conector só vira círculo se estiver entre duas palavras e for curto
  return words.map((w, i) => ({ text: w, conn: CONNECTORS.has(w) && w.length <= 3 && i > 0 && i < words.length - 1, key: i === key }));
}

function unitsOf(toks: Tok[]): Unit[] {
  const units: Unit[] = [];
  let pending: Tok[] = [];
  for (const t of toks) {
    if (t.conn) { pending.push(t); continue; }
    units.push([...pending, t]);
    pending = [];
  }
  if (pending.length) units.length ? units[units.length - 1].push(...pending.map((p) => ({ ...p, conn: false }))) : units.push(pending);
  return units;
}

/** Todas as divisões das unidades em até maxLines linhas contíguas. */
function partitions(n: number, maxLines: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (start === n) { out.push(acc); return; }
    if (acc.length >= maxLines) return;
    for (let end = start + 1; end <= n; end++) rec(end, [...acc, end - start]);
  };
  rec(0, []);
  return out;
}

export interface TitlePlan { lines: Array<{ units: Unit[]; fs: number; w: number }>; height: number; minFs: number }

/** Escolhe a divisão em linhas que ocupa melhor a caixa. */
export function planTitle(text: string, face: Face, style: Pick<TitleStyle, "depth" | "keyWord">, w: number, h: number, maxLines = 3, maxFs = Infinity): TitlePlan {
  const toks = splitTitle(text, style.keyWord);
  let units = unitsOf(toks);
  // títulos muito longos: agrupa em pares para limitar a busca
  while (units.length > 9) units = units.reduce<Unit[]>((acc, u, i) => (i % 2 ? (acc[acc.length - 1].push(...u), acc) : [...acc, [...u]]), []);
  const cap = capOf(face);
  const depth = style.depth;
  const padX = OUTER + depth * 0.45;
  const lineH = (fs: number) => fs * (cap + OUTER + depth + 0.07);
  let best: (TitlePlan & { score: number }) | null = null;
  for (const parts of partitions(units.length, Math.max(1, maxLines))) {
    let i = 0;
    const lines = parts.map((n) => { const us = units.slice(i, i + n); i += n; return { units: us, em: lineWidth(us, face) + padX }; });
    let fss = lines.map((l) => Math.min(maxFs, w / l.em));
    const mn = Math.min(...fss);
    fss = fss.map((f) => Math.min(f, mn * 1.4));
    const total = fss.reduce((s, f) => s + lineH(f), 0);
    const k = Math.min(1, h / total);
    fss = fss.map((f) => f * k);
    const area = fss.reduce((s, f, j) => s + f * f * lines[j].em, 0);
    const score = area * (1 - 0.04 * (parts.length - 1));
    if (!best || score > best.score) best = { score, lines: lines.map((l, j) => ({ units: l.units, fs: fss[j], w: l.em * fss[j] })), height: fss.reduce((s, f) => s + lineH(f), 0), minFs: Math.min(...fss) };
  }
  return best!;
}

export function Title3D({ text, x, y, w, h, style, maxLines = 3, align = "center", maxFs, valign = "center" }: { text: string; x: number; y: number; w: number; h: number; style: TitleStyle; maxLines?: number; align?: "center" | "left"; maxFs?: number; valign?: "center" | "top" | "bottom" }): ReactElement {
  const face = style.face;
  const plan = planTitle(text, face, style, w, h, maxLines, maxFs);
  const cap = capOf(face);
  const id = `t3${hid(text, style.fill.join(), style.keyFill.join(), style.stroke, style.outer, Math.round(w), Math.round(h))}`;
  const steps = (fs: number) => Math.max(2, Math.min(12, Math.round((style.depth * fs) / 1.4)));
  let cy = valign === "top" ? 0 : valign === "bottom" ? h - plan.height : (h - plan.height) / 2;
  const layers: { ext: ReactElement[]; outer: ReactElement[]; inner: ReactElement[]; fill: ReactElement[] } = { ext: [], outer: [], inner: [], fill: [] };
  const font = { fontFamily: fontStack(face.family), fontWeight: face.weight, fontStyle: face.italic ? "italic" : undefined } as const;

  plan.lines.forEach((line, li) => {
    const fs = line.fs;
    const base = cy + fs * (OUTER / 2 + cap);
    let cx = align === "center" ? (w - line.w) / 2 + fs * OUTER / 2 : fs * OUTER / 2;
    const items: Array<{ kind: "word"; x: number; w: number; t: Tok } | { kind: "conn"; x: number; t: Tok }> = [];
    line.units.forEach((u, ui) => {
      if (ui > 0) cx += fs * (u[0].conn ? GAP_CONN * 1.5 : GAP_WORD);
      u.forEach((t, ti) => {
        if (ti > 0) cx += fs * (t.conn || u[ti - 1].conn ? GAP_CONN : GAP_WORD);
        if (t.conn) { items.push({ kind: "conn", x: cx, t }); cx += fs * CIRCLE; }
        else { const tw = textWidth(t.text, face, fs); items.push({ kind: "word", x: cx, w: tw, t }); cx += tw; }
      });
    });
    const n = steps(fs);
    const dx = style.depth * fs * 0.35, dy = style.depth * fs;
    const draw = (key: string, mode: "ext" | "outer" | "inner" | "fill", off = 0) => items.map((it, k) => {
      const tx = r1(it.x + (mode === "ext" ? (dx * off) / n : 0));
      const ty = r1(base + (mode === "ext" ? (dy * off) / n : 0));
      if (it.kind === "conn") {
        const r = (fs * CIRCLE) / 2;
        const ccx = r1(tx + r), ccy = r1(ty - (cap * fs) / 2);
        const lfs = r1(fs * Math.min(0.27, (CIRCLE * 0.78) / Math.max(1, textWidth(it.t.text, LABEL, 1))));
        if (mode === "ext") return <circle key={`${key}${k}`} cx={ccx} cy={ccy} r={r1(r + fs * OUTER / 2)} fill={style.extrude} />;
        if (mode === "outer") return <circle key={`${key}${k}`} cx={ccx} cy={ccy} r={r1(r + fs * OUTER / 2)} fill={style.outer} />;
        if (mode === "inner") return <circle key={`${key}${k}`} cx={ccx} cy={ccy} r={r1(r + fs * INNER / 2)} fill={style.stroke} />;
        return (
          <g key={`${key}${k}`}>
            <circle cx={ccx} cy={ccy} r={r1(r)} fill={style.connectorBg} />
            <text x={ccx} y={r1(ccy + (capOf(LABEL) * lfs) / 2)} textAnchor="middle" fontFamily={fontStack(LABEL.family)} fontWeight={LABEL.weight} fontSize={lfs} fill={style.connectorFg}>{it.t.text}</text>
          </g>
        );
      }
      const common = { x: tx, y: ty, fontSize: r1(fs), textLength: r1(it.w), lengthAdjust: "spacingAndGlyphs", ...font };
      if (mode === "ext") return <text key={`${key}${k}`} {...common} fill={style.extrude} stroke={style.extrude} strokeWidth={r1(fs * OUTER)} strokeLinejoin="round">{it.t.text}</text>;
      if (mode === "outer") return <text key={`${key}${k}`} {...common} fill={style.outer} stroke={style.outer} strokeWidth={r1(fs * OUTER)} strokeLinejoin="round">{it.t.text}</text>;
      if (mode === "inner") return <text key={`${key}${k}`} {...common} fill={style.stroke} stroke={style.stroke} strokeWidth={r1(fs * INNER)} strokeLinejoin="round">{it.t.text}</text>;
      return <text key={`${key}${k}`} {...common} fill={`url(#${id}${it.t.key ? "k" : "f"})`}>{it.t.text}</text>;
    });
    for (let s = n; s >= 1; s--) layers.ext.push(<g key={`e${li}-${s}`}>{draw(`e${li}-${s}-`, "ext", s)}</g>);
    layers.outer.push(<g key={`o${li}`}>{draw(`o${li}-`, "outer")}</g>);
    layers.inner.push(<g key={`i${li}`}>{draw(`i${li}-`, "inner")}</g>);
    layers.fill.push(<g key={`f${li}`}>{draw(`f${li}-`, "fill")}</g>);
    cy += fs * (cap + OUTER + style.depth + 0.07);
  });

  return (
    <h1 data-ev-title="" aria-label={text} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), margin: 0, fontSize: r1(plan.minFs), lineHeight: 1, overflow: "hidden" }}>
      <svg aria-hidden="true" width={r1(w)} height={r1(h)} viewBox={`0 0 ${r1(w)} ${r1(h)}`} style={{ display: "block", overflow: "visible", filter: `drop-shadow(0 ${r1(plan.minFs * 0.06)}px ${r1(plan.minFs * 0.08)}px rgba(0,0,0,.45))` }}>
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stopColor={style.fill[0]} /><stop offset="1" stopColor={style.fill[1]} /></linearGradient>
          <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stopColor={style.keyFill[0]} /><stop offset="0.95" stopColor={style.keyFill[1]} /></linearGradient>
        </defs>
        {layers.ext}{layers.outer}{layers.inner}{layers.fill}
      </svg>
    </h1>
  );
}
