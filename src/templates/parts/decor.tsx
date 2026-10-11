// Biblioteca de ornamentos próprios (SVG/CSS) usados pelos modelos. Nada de imagens de terceiros.
import type { CSSProperties, ReactElement } from "react";
import { round } from "./text";

export const abs = (x: number, y: number, w: number, h: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left: round(x), top: round(y), width: round(w), height: round(h), ...extra });

/** Raios de sol a partir de um ponto (cx, cy) — fundo de cabeçalho. */
export function Sunburst({ x, y, w, h, cx, cy, color, rays = 24, opacity = 1 }: { x: number; y: number; w: number; h: number; cx: number; cy: number; color: string; rays?: number; opacity?: number }) {
  const R = Math.hypot(w, h) * 1.2;
  const paths: string[] = [];
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 0.5) / rays) * Math.PI * 2;
    paths.push(`M${round(cx)} ${round(cy)}L${round(cx + R * Math.cos(a0))} ${round(cy + R * Math.sin(a0))}L${round(cx + R * Math.cos(a1))} ${round(cy + R * Math.sin(a1))}Z`);
  }
  return <svg style={abs(x, y, w, h)} viewBox={`0 0 ${round(w)} ${round(h)}`} aria-hidden="true"><path d={paths.join("")} fill={color} opacity={opacity} /></svg>;
}

/** Xadrez de toalha de feira. */
export function Gingham({ x, y, w, h, color, size }: { x: number; y: number; w: number; h: number; color: string; size: number }) {
  const id = `g${Math.round(size * 10)}${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg style={abs(x, y, w, h)} aria-hidden="true">
      <defs>
        <pattern id={id} width={size * 2} height={size * 2} patternUnits="userSpaceOnUse">
          <rect width={size} height={size * 2} fill={color} opacity="0.45" />
          <rect width={size * 2} height={size} fill={color} opacity="0.45" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Padrão de pontos (meio-tom). */
export function Dots({ x, y, w, h, color, size, opacity = 1, id }: { x: number; y: number; w: number; h: number; color: string; size: number; opacity?: number; id: string }) {
  return (
    <svg style={abs(x, y, w, h)} aria-hidden="true">
      <defs><pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse"><circle cx={size / 2} cy={size / 2} r={size * 0.2} fill={color} /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  );
}

/** Listras diagonais. */
export function Stripes({ x, y, w, h, color, size, opacity = 1, id, angle = 45 }: { x: number; y: number; w: number; h: number; color: string; size: number; opacity?: number; id: string; angle?: number }) {
  return (
    <svg style={abs(x, y, w, h)} aria-hidden="true">
      <defs><pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}><rect width={size / 2} height={size} fill={color} /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity} />
    </svg>
  );
}

/** Onda na borda inferior de uma faixa (preenche de cima até a onda). */
export function WaveBand({ x, y, w, h, color, waves = 3, depth = 0.25, flip = false }: { x: number; y: number; w: number; h: number; color: string; waves?: number; depth?: number; flip?: boolean }) {
  const d = h * depth;
  const seg = w / waves;
  let p = flip ? `M0 ${h}L0 ${d}` : `M0 0L0 ${h - d}`;
  for (let i = 0; i < waves; i++) {
    const x0 = i * seg;
    p += flip
      ? `Q${round(x0 + seg / 4)} ${round(d * 2)} ${round(x0 + seg / 2)} ${round(d)}T${round(x0 + seg)} ${round(d)}`
      : `Q${round(x0 + seg / 4)} ${round(h)} ${round(x0 + seg / 2)} ${round(h - d)}T${round(x0 + seg)} ${round(h - d)}`;
  }
  p += flip ? `L${round(w)} ${round(h)}Z` : `L${round(w)} 0Z`;
  return <svg style={abs(x, y, w, h)} viewBox={`0 0 ${round(w)} ${round(h)}`} preserveAspectRatio="none" aria-hidden="true"><path d={p} fill={color} /></svg>;
}

/** Folha estilizada. */
export function Leaf({ x, y, size, color, rotate = 0, vein }: { x: number; y: number; size: number; color: string; rotate?: number; vein?: string }) {
  return (
    <svg style={abs(x, y, size, size, { transform: `rotate(${rotate}deg)` })} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 4C80 20 92 52 50 96 8 52 20 20 50 4Z" fill={color} />
      {vein && <path d="M50 14V88M50 40L34 28M50 56L66 42M50 70L36 60" stroke={vein} strokeWidth="3" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

/** Floco de neve geométrico (6 braços). */
export function Snowflake({ x, y, size, color, opacity = 1, stroke = 4 }: { x: number; y: number; size: number; color: string; opacity?: number; stroke?: number }) {
  const arms = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <svg style={abs(x, y, size, size)} viewBox="0 0 100 100" aria-hidden="true" opacity={opacity}>
      {arms.map((a) => (
        <g key={a} transform={`rotate(${a} 50 50)`} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none">
          <path d="M50 50V8M50 24L40 14M50 24L60 14M50 36L42 30M50 36L58 30" />
        </g>
      ))}
    </svg>
  );
}

/** Estrela de 5 pontas. */
export function Star({ x, y, size, color, opacity = 1, rotate = 0 }: { x: number; y: number; size: number; color: string; opacity?: number; rotate?: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? 48 : 20;
    pts.push(`${round(50 + r * Math.cos(a))},${round(50 + r * Math.sin(a))}`);
  }
  return <svg style={abs(x, y, size, size, { transform: rotate ? `rotate(${rotate}deg)` : undefined })} viewBox="0 0 100 100" aria-hidden="true"><polygon points={pts.join(" ")} fill={color} opacity={opacity} /></svg>;
}

/** Raio (relâmpago) estilizado. */
export function Bolt({ x, y, w, h, color, opacity = 1 }: { x: number; y: number; w: number; h: number; color: string; opacity?: number }) {
  return <svg style={abs(x, y, w, h)} viewBox="0 0 60 100" preserveAspectRatio="none" aria-hidden="true"><path d="M36 0L4 58H28L20 100L56 36H32Z" fill={color} opacity={opacity} /></svg>;
}

/** Bolhas (círculos vazados). */
export function Bubbles({ x, y, w, h, color, count = 14, seed = 1, opacity = 0.5 }: { x: number; y: number; w: number; h: number; color: string; count?: number; seed?: number; opacity?: number }) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const S = Math.min(w, h);
  const items: ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    const r = S * (0.03 + rnd() * 0.09);
    items.push(<circle key={i} cx={round(rnd() * w)} cy={round(rnd() * h)} r={round(r)} fill="none" stroke={color} strokeWidth={round(Math.max(1.5, r * 0.18))} opacity={opacity} />);
  }
  return <svg style={abs(x, y, w, h)} aria-hidden="true">{items}</svg>;
}

/** Espiga de trigo. */
export function Wheat({ x, y, w, h, color, rotate = 0 }: { x: number; y: number; w: number; h: number; color: string; rotate?: number }) {
  const grains = [20, 32, 44, 56, 68];
  return (
    <svg style={abs(x, y, w, h, { transform: `rotate(${rotate}deg)` })} viewBox="0 0 40 100" aria-hidden="true">
      <path d="M20 100V14" stroke={color} strokeWidth="2.5" />
      {grains.map((g) => (
        <g key={g} fill={color}>
          <ellipse cx="13" cy={g} rx="5" ry="9" transform={`rotate(-28 13 ${g})`} />
          <ellipse cx="27" cy={g} rx="5" ry="9" transform={`rotate(28 27 ${g})`} />
        </g>
      ))}
      <ellipse cx="20" cy="9" rx="4.5" ry="8" fill={color} />
    </svg>
  );
}

/** Borda recortada (scallop) — faixa de semicírculos. */
export function Scallop({ x, y, w, h, color, count }: { x: number; y: number; w: number; h: number; color: string; count: number }) {
  const r = w / count / 2;
  return (
    <svg style={abs(x, y, w, h)} viewBox={`0 0 ${round(w)} ${round(h)}`} preserveAspectRatio="none" aria-hidden="true">
      <rect width={round(w)} height={round(Math.max(0, h - r))} fill={color} />
      {Array.from({ length: count }, (_, i) => <circle key={i} cx={round(r + i * 2 * r)} cy={round(h - r)} r={round(r)} fill={color} />)}
    </svg>
  );
}
