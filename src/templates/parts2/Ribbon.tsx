// Fita inclinada com pontas cortadas "a pincel" (v2) para chamadas secundárias (subtítulo, validade, seções).
import type { ReactElement } from "react";
import { fitWidth, fontStack, textWidth, capOf, type Face } from "./measure";
import { darken } from "./look";
import { ensureContrast } from "../parts/color";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Contorno de uma faixa com pontas irregulares (determinístico). */
export function brushPath(w: number, h: number, seed = 3): string {
  const jag = Math.max(3, h * 0.16);
  const n = 7;
  let s = seed * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) % 1000) / 1000;
  let d = `M${r1(jag * 0.6)} 0`;
  d += `L${r1(w - jag)} ${r1(h * 0.04)}`;
  for (let i = 1; i <= n; i++) d += `L${r1(w - jag + (i % 2 ? jag : jag * 0.15 * rnd()))} ${r1((h * i) / n)}`;
  d += `L${r1(jag * 0.9)} ${r1(h * 0.97)}`;
  for (let i = n - 1; i >= 1; i--) d += `L${r1(i % 2 ? 0 : jag * (0.5 + 0.4 * rnd()))} ${r1((h * i) / n)}`;
  return d + "Z";
}

export function Ribbon({ text, x, y, w, h, bg, fg, face, angle = -3, align = "center", seed = 3, upper = true, maxFs }: { text: string; x: number; y: number; w: number; h: number; bg: string; fg: string; face: Face; angle?: number; align?: "center" | "left" | "right"; seed?: number; upper?: boolean; maxFs?: number }): ReactElement | null {
  const t = upper ? text.toLocaleUpperCase("pt-BR") : text;
  if (!t.trim()) return null;
  const pad = h * 0.55;
  const fs = fitWidth(t, face, w - pad * 2, Math.min(maxFs ?? Infinity, h * 0.62), 6);
  const tw = textWidth(t, face, fs);
  const bw = Math.min(w, tw + pad * 2);
  const bx = align === "left" ? x : align === "right" ? x + w - bw : x + (w - bw) / 2;
  const color = ensureContrast(fg, bg, 4.5);
  const cap = capOf(face);
  return (
    <div data-ev-ribbon="" style={{ position: "absolute", left: r1(bx), top: r1(y), width: r1(bw), height: r1(h), transform: `rotate(${angle}deg)`, filter: "drop-shadow(0 3px 2px rgba(0,0,0,.35))" }}>
      <svg aria-hidden="true" width={r1(bw)} height={r1(h)} viewBox={`0 0 ${r1(bw)} ${r1(h)}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d={brushPath(bw, h, seed + 1)} fill={darken(bg, 0.35)} transform={`translate(${r1(h * 0.08)} ${r1(h * 0.1)})`} />
        <path d={brushPath(bw, h, seed)} fill={bg} />
        <path d={`M${r1(h * 0.5)} ${r1(h * 0.16)}H${r1(bw - h * 0.5)}`} stroke="#ffffff" strokeOpacity=".22" strokeWidth={r1(Math.max(1, h * 0.06))} strokeLinecap="round" />
      </svg>
      <div data-ev-text="" style={{ position: "absolute", left: 0, top: 0, width: r1(bw), height: r1(h), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontStack(face.family), fontWeight: face.weight, fontStyle: face.italic ? "italic" : undefined, fontSize: fs, lineHeight: 1, color, whiteSpace: "nowrap", paddingTop: r1(Math.max(0, (1 - cap) * fs * 0.1)) }}>{t}</div>
    </div>
  );
}
