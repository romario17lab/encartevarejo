// Fundos com profundidade (v2): gradiente radial mais claro no centro + textura própria em CSS/SVG.
// Nunca cor chapada. Tudo desenhado aqui (sem imagens externas) e determinístico.
import type { CSSProperties, ReactElement } from "react";
import { alpha } from "../parts/color";
import { hid, rng, type Ground } from "./look";

const r1 = (n: number) => Math.round(n * 10) / 10;
const full: CSSProperties = { position: "absolute", inset: 0 };

function svgBox(w: number, h: number, children: ReactElement | ReactElement[], style?: CSSProperties) {
  return <svg aria-hidden="true" width={r1(w)} height={r1(h)} viewBox={`0 0 ${r1(w)} ${r1(h)}`} style={{ position: "absolute", left: 0, top: 0, overflow: "hidden", ...style }}>{children}</svg>;
}

/** Ruído orgânico (papel, madeira, papelão) via feTurbulence. */
function Noise({ w, h, freq, octaves = 3, opacity, blend = "multiply", tone = "#000000", id, lit }: { w: number; h: number; freq: string; octaves?: number; opacity: number; blend?: CSSProperties["mixBlendMode"]; tone?: string; id: string; lit?: boolean }) {
  return svgBox(w, h, (
    <g>
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} seed={7} result="n" />
          {lit ? (
            <>
              <feDiffuseLighting in="n" surfaceScale={6} lightingColor="#ffffff" result="l"><feDistantLight azimuth={225} elevation={50} /></feDiffuseLighting>
              <feColorMatrix in="l" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.7 0 0 0 1.45" />
            </>
          ) : (
            <feColorMatrix in="n" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35`} />
          )}
        </filter>
      </defs>
      <rect width="100%" height="100%" fill={tone} filter={`url(#${id})`} />
    </g>
  ), { opacity, mixBlendMode: blend });
}

function radial(g: Ground, at = "50% 42%"): string {
  return `radial-gradient(ellipse 75% 85% at ${at}, ${g.light} 0%, ${g.base} 48%, ${g.dark} 100%)`;
}

/** Estrela de N pontas (path) centrada em (cx, cy). */
export function starPath(cx: number, cy: number, R: number, r: number, n: number, rot = -Math.PI / 2): string {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (Math.PI * i) / n;
    const rr = i % 2 === 0 ? R : r;
    d += `${i ? "L" : "M"}${r1(cx + rr * Math.cos(a))} ${r1(cy + rr * Math.sin(a))}`;
  }
  return d + "Z";
}

export function leafPath(cx: number, cy: number, s: number, rot: number): string {
  // folha simples apontando para "rot" (graus)
  const a = (rot * Math.PI) / 180;
  const p = (x: number, y: number) => `${r1(cx + (x * Math.cos(a) - y * Math.sin(a)) * s)} ${r1(cy + (x * Math.sin(a) + y * Math.cos(a)) * s)}`;
  return `M${p(0, 0)}C${p(0.35, -0.32)} ${p(0.75, -0.25)} ${p(1, 0)}C${p(0.75, 0.25)} ${p(0.35, 0.32)} ${p(0, 0)}Z`;
}

export function GroundFill({ g, w, h, seed = 1, focus = "50% 42%" }: { g: Ground; w: number; h: number; seed?: number; focus?: string }): ReactElement {
  const S = Math.min(w, h);
  const L = Math.max(w, h);
  const id = hid(g.kind, g.base, g.light, g.dark, Math.round(w), Math.round(h), seed);
  const rnd = rng(seed + Math.round(w) + Math.round(h) * 3);
  const acc = g.accents ?? ["#ffd23f", "#ffffff"];
  const layers: ReactElement[] = [];
  let bg = radial(g, focus);

  switch (g.kind) {
    case "rays":
    case "confetti": {
      const step = g.kind === "rays" ? 7.5 : 10;
      layers.push(<div key="rays" style={{ ...full, background: `repeating-conic-gradient(from 0deg at ${focus}, ${alpha(g.light, 0.55)} 0deg ${step * 0.45}deg, ${alpha(g.light, 0)} ${step * 0.45}deg ${step}deg)`, WebkitMaskImage: `radial-gradient(ellipse 80% 90% at ${focus}, #000 0%, rgba(0,0,0,.55) 45%, transparent 85%)`, maskImage: `radial-gradient(ellipse 80% 90% at ${focus}, #000 0%, rgba(0,0,0,.55) 45%, transparent 85%)` }} />);
      if (g.kind === "confetti") {
        const n = Math.round(Math.min(160, (w * h) / (S * S) * 26));
        const items: ReactElement[] = [];
        for (let i = 0; i < n; i++) {
          const x = rnd() * w, y = rnd() * h, sz = S * (0.012 + rnd() * 0.02), c = acc[i % acc.length], rot = Math.round(rnd() * 180);
          const t = i % 3;
          if (t === 0) items.push(<rect key={i} x={r1(x)} y={r1(y)} width={r1(sz * 1.8)} height={r1(sz * 0.8)} rx={r1(sz * 0.15)} fill={c} transform={`rotate(${rot} ${r1(x)} ${r1(y)})`} opacity={0.9} />);
          else if (t === 1) items.push(<circle key={i} cx={r1(x)} cy={r1(y)} r={r1(sz * 0.55)} fill={c} opacity={0.85} />);
          else items.push(<path key={i} d={`M${r1(x)} ${r1(y)}q${r1(sz)} ${r1(-sz)} ${r1(sz * 2)} 0t${r1(sz * 2)} 0`} stroke={c} strokeWidth={r1(sz * 0.45)} fill="none" strokeLinecap="round" transform={`rotate(${rot} ${r1(x)} ${r1(y)})`} opacity={0.9} />);
        }
        layers.push(<div key="cf" style={full}>{svgBox(w, h, <g>{items}</g>)}</div>);
      }
      break;
    }
    case "halftone": {
      const d = Math.max(6, S / 34);
      layers.push(<div key="ht" style={{ ...full, backgroundImage: `radial-gradient(circle, ${alpha(g.light, 0.5)} 0 ${r1(d * 0.22)}px, transparent ${r1(d * 0.24)}px)`, backgroundSize: `${r1(d)}px ${r1(d)}px`, WebkitMaskImage: "linear-gradient(160deg, #000 0%, transparent 55%, #000 100%)", maskImage: "linear-gradient(160deg, #000 0%, transparent 55%, #000 100%)" }} />);
      break;
    }
    case "stripes": {
      const d = Math.max(10, S / 22);
      layers.push(<div key="st" style={{ ...full, backgroundImage: `repeating-linear-gradient(135deg, ${alpha(g.light, 0.22)} 0 ${r1(d * 0.5)}px, transparent ${r1(d * 0.5)}px ${r1(d)}px)` }} />);
      break;
    }
    case "hazard": {
      const d = Math.max(14, S / 14);
      const c = acc[0];
      layers.push(<div key="hz" style={{ ...full, backgroundImage: `repeating-linear-gradient(-45deg, ${alpha(c, 0.13)} 0 ${r1(d * 0.5)}px, transparent ${r1(d * 0.5)}px ${r1(d)}px)` }} />);
      layers.push(<div key="vg" style={{ ...full, background: `radial-gradient(ellipse 70% 70% at 50% 45%, ${alpha(g.light, 0.55)} 0%, transparent 70%)` }} />);
      break;
    }
    case "wood": {
      const P = Math.max(26, Math.min(h / 3.2, S / 3.2, 120));
      bg = `linear-gradient(180deg, ${g.light} 0%, ${g.base} 55%, ${g.dark} 100%)`;
      layers.push(<Noise key="grain" w={w} h={h} freq={`0.0025 ${Math.min(0.2, 4 / P).toFixed(3)}`} octaves={4} opacity={0.55} id={`gr${id}`} />);
      layers.push(<div key="pl" style={{ ...full, backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${r1(P - 3)}px, rgba(0,0,0,.42) ${r1(P - 3)}px ${r1(P - 1.5)}px, rgba(255,255,255,.18) ${r1(P - 1.5)}px ${r1(P)}px)` }} />);
      // emendas verticais desencontradas
      const joints: ReactElement[] = [];
      for (let row = 0; row * P < h; row++) {
        const jx = ((row * 0.37 + 0.21) % 1) * w;
        joints.push(<rect key={row} x={r1(jx)} y={r1(row * P)} width={2} height={r1(P - 3)} fill="rgba(0,0,0,.35)" />);
      }
      layers.push(<div key="jt" style={full}>{svgBox(w, h, <g>{joints}</g>)}</div>);
      layers.push(<div key="vg" style={{ ...full, background: `radial-gradient(ellipse 80% 90% at 50% 40%, transparent 50%, ${alpha(g.dark, 0.6)} 100%)` }} />);
      break;
    }
    case "kraft": {
      bg = `linear-gradient(170deg, ${g.light} 0%, ${g.base} 60%, ${g.dark} 100%)`;
      layers.push(<Noise key="n" w={w} h={h} freq="0.9" octaves={2} opacity={0.35} id={`kn${id}`} />);
      layers.push(<Noise key="n2" w={w} h={h} freq="0.012 0.02" octaves={3} opacity={0.12} id={`kc${id}`} />);
      layers.push(<div key="cor" style={{ ...full, backgroundImage: `repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, transparent 2px ${r1(Math.max(8, S / 50))}px)` }} />);
      break;
    }
    case "paper": {
      layers.push(<Noise key="p" w={w} h={h} freq={`${r1(Math.max(0.004, 2.2 / S) * 1000) / 1000}`} octaves={4} opacity={0.8} blend="multiply" id={`pp${id}`} lit />);
      layers.push(<div key="vg" style={{ ...full, background: `radial-gradient(ellipse 80% 80% at ${focus}, transparent 40%, ${alpha(g.dark, 0.7)} 100%)` }} />);
      break;
    }
    case "carbon": {
      const c = Math.max(6, Math.round(S / 70));
      const a = "#0d0d0d", b = "#1c1c1c", d = "#262626";
      layers.push(<div key="cb" style={{ ...full, opacity: 0.85, background: `linear-gradient(27deg, ${a} ${c / 2}px, transparent ${c / 2}px) 0 ${c / 2}px, linear-gradient(207deg, ${a} ${c / 2}px, transparent ${c / 2}px) ${c}px 0, linear-gradient(27deg, ${b} ${c / 2}px, transparent ${c / 2}px) 0 ${c}px, linear-gradient(207deg, ${b} ${c / 2}px, transparent ${c / 2}px) ${c}px ${c / 2}px, linear-gradient(90deg, #151515 ${c}px, transparent ${c}px), linear-gradient(${a} 25%, #141414 25%, #141414 50%, transparent 50%, transparent 75%, ${d} 75%, ${d})`, backgroundSize: `${c * 2}px ${c * 2}px`, backgroundColor: "#121212" }} />);
      layers.push(<div key="tint" style={{ ...full, background: `radial-gradient(ellipse 75% 85% at ${focus}, ${alpha(g.light, 0.75)} 0%, ${alpha(g.base, 0.55)} 50%, ${alpha(g.dark, 0.85)} 100%)` }} />);
      break;
    }
    case "gold": {
      const lines: ReactElement[] = [];
      const cx = w / 2, cy = h * 1.05;
      for (let i = 0; i < 36; i++) {
        const a = Math.PI + (Math.PI * (i + 0.5)) / 36;
        lines.push(<line key={i} x1={r1(cx)} y1={r1(cy)} x2={r1(cx + Math.cos(a) * L * 1.5)} y2={r1(cy + Math.sin(a) * L * 1.5)} stroke={acc[0]} strokeWidth={Math.max(0.8, S / 500)} opacity={0.22} />);
      }
      const sp: ReactElement[] = [];
      const n = Math.round(Math.min(70, (w * h) / (S * S) * 14));
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, s = S * (0.006 + rnd() * 0.016);
        sp.push(<path key={i} d={starPath(x, y, s, s * 0.22, 4)} fill={i % 3 ? acc[0] : "#ffffff"} opacity={0.35 + rnd() * 0.5} />);
      }
      layers.push(<div key="g" style={full}>{svgBox(w, h, <g>{lines}{sp}</g>)}</div>);
      break;
    }
    case "flames": {
      const fl: ReactElement[] = [];
      const n = Math.max(6, Math.round(w / (S * 0.12)));
      const base = h;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * (w / n) + (rnd() - 0.5) * (w / n) * 0.6;
        const fh = h * (0.28 + rnd() * 0.32), fw = (w / n) * (1.1 + rnd() * 0.6);
        fl.push(<path key={`f${i}`} d={`M${r1(cx - fw / 2)} ${r1(base)}C${r1(cx - fw / 2)} ${r1(base - fh * 0.45)} ${r1(cx + fw * 0.15)} ${r1(base - fh * 0.55)} ${r1(cx + (rnd() - 0.5) * fw * 0.3)} ${r1(base - fh)}C${r1(cx + fw * 0.5)} ${r1(base - fh * 0.5)} ${r1(cx + fw / 2)} ${r1(base - fh * 0.3)} ${r1(cx + fw / 2)} ${r1(base)}Z`} fill={`url(#fl${id})`} opacity={0.9} />);
      }
      const em: ReactElement[] = [];
      for (let i = 0; i < 40; i++) em.push(<circle key={`e${i}`} cx={r1(rnd() * w)} cy={r1(h * (0.25 + rnd() * 0.7))} r={r1(S * (0.003 + rnd() * 0.008))} fill={acc[i % acc.length]} opacity={0.5 + rnd() * 0.5} />);
      layers.push(<div key="fl" style={full}>{svgBox(w, h, [
        <defs key="d"><linearGradient id={`fl${id}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={acc[0]} /><stop offset=".45" stopColor={acc[1] ?? "#ff7a00"} /><stop offset="1" stopColor={acc[2] ?? "#c81e00"} stopOpacity="0" /></linearGradient></defs>,
        <g key="g">{fl}{em}</g>,
      ])}</div>);
      break;
    }
    case "ice":
    case "bubbles": {
      const items: ReactElement[] = [];
      const n = Math.round(Math.min(90, (w * h) / (S * S) * (g.kind === "ice" ? 16 : 20)));
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, r = S * (g.kind === "ice" ? 0.006 + rnd() * 0.02 : 0.01 + rnd() * 0.045);
        items.push(<circle key={`b${i}`} cx={r1(x)} cy={r1(y)} r={r1(r)} fill={`url(#bb${id})`} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={r1(Math.max(0.6, r * 0.08))} />);
        items.push(<ellipse key={`s${i}`} cx={r1(x - r * 0.35)} cy={r1(y - r * 0.4)} rx={r1(r * 0.28)} ry={r1(r * 0.16)} fill="#ffffff" opacity={0.75} transform={`rotate(-35 ${r1(x - r * 0.35)} ${r1(y - r * 0.4)})`} />);
      }
      if (g.kind === "ice") {
        const cubes = [[0.04, 0.12, 0.2, -14], [0.9, 0.18, 0.16, 18], [0.12, 0.88, 0.14, 24], [0.95, 0.9, 0.2, -8], [0.5, 1.02, 0.15, 10]];
        cubes.forEach(([fx, fy, fs, rot], i) => {
          const s = S * fs, x = fx * w - s / 2, y = fy * h - s / 2;
          items.push(
            <g key={`c${i}`} transform={`rotate(${rot} ${r1(x + s / 2)} ${r1(y + s / 2)})`} opacity={0.75}>
              <rect x={r1(x)} y={r1(y)} width={r1(s)} height={r1(s)} rx={r1(s * 0.18)} fill={`url(#ic${id})`} stroke="#ffffff" strokeOpacity={0.8} strokeWidth={r1(Math.max(1, s * 0.03))} />
              <path d={`M${r1(x + s * 0.18)} ${r1(y + s * 0.3)}Q${r1(x + s * 0.2)} ${r1(y + s * 0.18)} ${r1(x + s * 0.34)} ${r1(y + s * 0.16)}`} stroke="#ffffff" strokeWidth={r1(Math.max(1, s * 0.06))} strokeLinecap="round" fill="none" />
            </g>,
          );
        });
      }
      layers.push(<div key="b" style={full}>{svgBox(w, h, [
        <defs key="d">
          <radialGradient id={`bb${id}`} cx=".5" cy=".5" r=".5"><stop offset=".55" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#ffffff" stopOpacity=".45" /></radialGradient>
          <linearGradient id={`ic${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".7" /><stop offset=".5" stopColor={acc[0] ?? "#bdf3ff"} stopOpacity=".35" /><stop offset="1" stopColor="#ffffff" stopOpacity=".15" /></linearGradient>
        </defs>,
        <g key="g">{items}</g>,
      ])}</div>);
      break;
    }
    case "snow": {
      const items: ReactElement[] = [];
      const n = Math.round(Math.min(80, (w * h) / (S * S) * 18));
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, s = S * (0.008 + rnd() * 0.03);
        if (i % 3 === 0) {
          const arms = [0, 60, 120].map((a) => `M${r1(x + s * Math.cos((a * Math.PI) / 180))} ${r1(y + s * Math.sin((a * Math.PI) / 180))}L${r1(x - s * Math.cos((a * Math.PI) / 180))} ${r1(y - s * Math.sin((a * Math.PI) / 180))}`).join("");
          items.push(<path key={i} d={arms} stroke="#ffffff" strokeWidth={r1(Math.max(0.8, s * 0.16))} strokeLinecap="round" opacity={0.55} />);
        } else items.push(<circle key={i} cx={r1(x)} cy={r1(y)} r={r1(s * 0.22)} fill="#ffffff" opacity={0.35 + rnd() * 0.4} />);
      }
      layers.push(<div key="s" style={full}>{svgBox(w, h, <g>{items}</g>)}</div>);
      break;
    }
    case "wheat": {
      const s = Math.max(30, S / 6);
      const sprig = (x: number, y: number, k: number) => (
        <g key={k} transform={`translate(${r1(x)} ${r1(y)}) rotate(${k % 2 ? 25 : -25}) scale(${r1(s / 100)})`} fill={acc[0]} opacity={0.16}>
          <path d="M0 50V-40" stroke={acc[0]} strokeWidth="3" />
          {[-30, -14, 2, 18].map((gy) => <g key={gy}><ellipse cx="-7" cy={gy} rx="5" ry="10" transform={`rotate(-28 -7 ${gy})`} /><ellipse cx="7" cy={gy} rx="5" ry="10" transform={`rotate(28 7 ${gy})`} /></g>)}
          <ellipse cx="0" cy="-44" rx="4.5" ry="9" />
        </g>
      );
      const items: ReactElement[] = [];
      let k = 0;
      for (let yy = s * 0.6; yy < h + s; yy += s * 1.1) for (let xx = ((k % 2) * s * 0.6); xx < w + s; xx += s * 1.2) items.push(sprig(xx, yy, k++));
      layers.push(<div key="w" style={full}>{svgBox(w, h, <g>{items}</g>)}</div>);
      layers.push(<Noise key="n" w={w} h={h} freq="0.75" octaves={2} opacity={0.18} id={`wn${id}`} />);
      break;
    }
    case "leaves": {
      const items: ReactElement[] = [];
      const n = Math.round(Math.min(60, (w * h) / (S * S) * 12));
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, s = S * (0.05 + rnd() * 0.08), rot = rnd() * 360;
        items.push(<path key={i} d={leafPath(x, y, s, rot)} fill={i % 2 ? g.light : g.dark} opacity={0.45} />);
      }
      layers.push(<div key="l" style={full}>{svgBox(w, h, <g>{items}</g>)}</div>);
      break;
    }
  }

  return (
    <div aria-hidden="true" style={{ ...full, background: bg, overflow: "hidden" }}>
      {layers}
    </div>
  );
}
