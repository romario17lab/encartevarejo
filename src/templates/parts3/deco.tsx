// Elementos de profundidade (v3), desenhados em SVG para este projeto: selos "%", raios de impacto,
// etiquetas voando, folhas, gotas, trigo, chamas, bolhas, moedas — posicionados nos cantos e cortados
// pela borda da página. Ficam ATRÁS dos cards (nunca cobrem preço nem nome).
// Kits de datas comemorativas: mudam só o cabeçalho e os cantos (o corpo da peça continua neutro).
import type { ReactElement } from "react";
import { darken, lighten } from "../parts2/look";
import { leafPath, starPath } from "../parts2/grounds";
import type { DecoKind3, DecoSpot3, KitId3, Look3 } from "./look3";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Desenho de um elemento numa caixa 100×100 (coordenadas locais). */
function Shape100({ kind, c, c2 }: { kind: DecoKind3; c: string; c2: string }): ReactElement {
  const shadow = "rgba(0,0,0,.28)";
  switch (kind) {
    case "percent":
      return (
        <g>
          <circle cx="54" cy="54" r="44" fill={shadow} />
          <circle cx="50" cy="50" r="44" fill={c} stroke={c2} strokeWidth="5" />
          <circle cx="36" cy="34" r="9" fill="none" stroke={c2} strokeWidth="7" />
          <circle cx="64" cy="66" r="9" fill="none" stroke={c2} strokeWidth="7" />
          <path d="M66 28 34 72" stroke={c2} strokeWidth="8" strokeLinecap="round" />
          <path d="M22 40Q26 22 42 16" stroke="#fff" strokeOpacity=".5" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "rays": {
      const els: ReactElement[] = [];
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const a2 = a + 0.12;
        els.push(<path key={i} d={`M50 50L${r1(50 + 52 * Math.cos(a))} ${r1(50 + 52 * Math.sin(a))}L${r1(50 + 52 * Math.cos(a2))} ${r1(50 + 52 * Math.sin(a2))}Z`} fill={i % 2 ? c : c2} />);
      }
      return <g>{els}</g>;
    }
    case "tag":
      return (
        <g>
          <path d="M30 18H86Q92 18 92 24V76Q92 82 86 82H30L8 50Z" fill={shadow} transform="translate(4 4)" />
          <path d="M30 18H86Q92 18 92 24V76Q92 82 86 82H30L8 50Z" fill={c} stroke={c2} strokeWidth="4" strokeLinejoin="round" />
          <circle cx="26" cy="50" r="6" fill={c2} />
          <path d="M26 50C14 36 6 30 -6 30" stroke={c2} strokeWidth="2.5" fill="none" />
          <text x="60" y="61" textAnchor="middle" fontFamily="Anton, Arial" fontSize="34" fill={c2}>%</text>
        </g>
      );
    case "leaf":
      return (
        <g>
          <path d={leafPath(10, 60, 80, -30)} fill={c} />
          <path d={leafPath(18, 74, 60, -70)} fill={c2} />
          <path d="M12 60 82 20" stroke={darken(c, 0.35)} strokeWidth="2" opacity=".6" />
        </g>
      );
    case "star":
      return <g><path d={starPath(53, 53, 46, 20, 5)} fill={shadow} /><path d={starPath(50, 50, 46, 20, 5)} fill={c} stroke={c2} strokeWidth="3" strokeLinejoin="round" /></g>;
    case "drop":
      return <g><path d="M50 6C70 36 82 52 82 66A32 32 0 0 1 18 66C18 52 30 36 50 6Z" fill={c} stroke={c2} strokeWidth="3" /><path d="M34 64Q34 52 42 44" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".7" /></g>;
    case "wheat":
      return (
        <g fill={c}>
          <path d="M50 98V18" stroke={c2} strokeWidth="3" />
          {[20, 34, 48, 62].map((y) => <g key={y}><ellipse cx="42" cy={y} rx="7" ry="13" transform={`rotate(-28 42 ${y})`} /><ellipse cx="58" cy={y} rx="7" ry="13" transform={`rotate(28 58 ${y})`} /></g>)}
          <ellipse cx="50" cy="10" rx="6" ry="12" />
        </g>
      );
    case "flame":
      return <g><path d="M50 4C66 26 84 40 84 64A34 34 0 0 1 16 64C16 48 28 40 32 26C38 40 44 42 46 36C48 24 46 14 50 4Z" fill={c} /><path d="M50 40C60 54 68 60 68 72A18 18 0 0 1 32 72C32 62 40 58 42 50C46 56 50 54 50 40Z" fill={c2} /></g>;
    case "bubble":
      return <g><circle cx="50" cy="50" r="44" fill={c} fillOpacity=".25" stroke={c2} strokeWidth="3" /><ellipse cx="34" cy="32" rx="12" ry="7" fill="#fff" opacity=".8" transform="rotate(-35 34 32)" /></g>;
    case "ornament":
      return (
        <g>
          <path d="M50 0V16" stroke={c2} strokeWidth="2" />
          <rect x="42" y="14" width="16" height="10" rx="2" fill={c2} />
          <circle cx="54" cy="62" r="38" fill="rgba(0,0,0,.25)" />
          <circle cx="50" cy="58" r="38" fill={c} />
          <path d="M14 52Q50 66 86 52" stroke={c2} strokeWidth="5" fill="none" />
          <path d="M16 68Q50 82 84 68" stroke={c2} strokeWidth="3" fill="none" />
          <ellipse cx="36" cy="42" rx="9" ry="6" fill="#fff" opacity=".6" transform="rotate(-30 36 42)" />
        </g>
      );
    case "snowflake": {
      const arms = [0, 60, 120].map((a) => {
        const t = (a * Math.PI) / 180;
        return <path key={a} d={`M${r1(50 + 44 * Math.cos(t))} ${r1(50 + 44 * Math.sin(t))}L${r1(50 - 44 * Math.cos(t))} ${r1(50 - 44 * Math.sin(t))}`} stroke={c} strokeWidth="6" strokeLinecap="round" />;
      });
      return <g>{arms}<circle cx="50" cy="50" r="8" fill={c2} /></g>;
    }
    case "egg":
      return (
        <g>
          <ellipse cx="53" cy="55" rx="32" ry="42" fill="rgba(0,0,0,.25)" />
          <ellipse cx="50" cy="52" rx="32" ry="42" fill={c} />
          <path d="M19 44Q34 34 50 44T81 44" stroke={c2} strokeWidth="6" fill="none" />
          <path d="M20 64Q35 56 50 64T80 64" stroke="#fff" strokeWidth="5" fill="none" />
          <circle cx="50" cy="30" r="4" fill="#fff" />
        </g>
      );
    case "heart":
      return <g><path d="M54 90C20 66 8 48 8 32A21 21 0 0 1 54 24A21 21 0 0 1 100 32C100 48 88 66 54 90Z" fill="rgba(0,0,0,.25)" /><path d="M50 86C16 62 4 44 4 28A21 21 0 0 1 50 20A21 21 0 0 1 96 28C96 44 84 62 50 86Z" fill={c} stroke={c2} strokeWidth="3" /><path d="M20 30Q22 20 32 18" stroke="#fff" strokeWidth="4" fill="none" opacity=".6" strokeLinecap="round" /></g>;
    case "flower": {
      const petals = [0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="50" cy="26" rx="15" ry="24" fill={c} transform={`rotate(${a} 50 50)`} />);
      return <g>{petals}<circle cx="50" cy="50" r="14" fill={c2} /></g>;
    }
    case "bolt":
      return <g><path d="M60 2 18 58H46L38 98 84 38H54Z" fill="rgba(0,0,0,.3)" transform="translate(4 4)" /><path d="M60 2 18 58H46L38 98 84 38H54Z" fill={c} stroke={c2} strokeWidth="3" strokeLinejoin="round" /></g>;
    case "flag": {
      // varal de bandeirinhas
      const cols = [c, c2, lighten(c, 0.4), darken(c2, 0.2)];
      return (
        <g>
          <path d="M-10 12Q50 30 110 12" stroke="#5a3a1a" strokeWidth="2" fill="none" />
          {[0, 1, 2, 3, 4].map((i) => {
            const x = -2 + i * 22, y = 14 + Math.sin((i / 4) * Math.PI) * 8;
            return <path key={i} d={`M${x} ${r1(y)}h18v26l-9-7-9 7z`} fill={cols[i % 4]} />;
          })}
        </g>
      );
    }
    case "coin":
      return <g><circle cx="54" cy="54" r="42" fill="rgba(0,0,0,.25)" /><circle cx="50" cy="50" r="42" fill={c} stroke={c2} strokeWidth="5" /><circle cx="50" cy="50" r="30" fill="none" stroke={c2} strokeWidth="3" /><text x="50" y="64" textAnchor="middle" fontFamily="Anton, Arial" fontSize="40" fill={c2}>$</text></g>;
  }
}

/** Um elemento posicionado (px), rotação em graus. */
export function DecoItem({ kind, x, y, size, rot = 0, c, c2, opacity = 1 }: { kind: DecoKind3; x: number; y: number; size: number; rot?: number; c: string; c2: string; opacity?: number }) {
  return (
    <svg aria-hidden="true" data-ev-deco={kind} width={r1(size)} height={r1(size)} viewBox="0 0 100 100" style={{ position: "absolute", left: r1(x), top: r1(y), overflow: "visible", transform: rot ? `rotate(${rot}deg)` : undefined, opacity }}>
      <Shape100 kind={kind} c={c} c2={c2} />
    </svg>
  );
}

/** Posição de um canto, com o elemento ~35% fora da página. */
function spotXY(at: DecoSpot3["at"], s: number, W: number, H: number, top: number): { x: number; y: number } {
  const out = s * 0.35;
  switch (at) {
    case "tl": return { x: -out, y: top - out * 0.4 };
    case "tr": return { x: W - s + out, y: top - out * 0.4 };
    case "bl": return { x: -out, y: H - s + out };
    case "br": return { x: W - s + out, y: H - s + out };
    case "ml": return { x: -s * 0.45, y: H * 0.52 - s / 2 };
    case "mr": return { x: W - s * 0.55, y: H * 0.46 - s / 2 };
  }
}

/** Elementos de profundidade da página (atrás dos cards). `top` = altura do cabeçalho (os de cima ficam logo abaixo dele). */
export function PageDeco({ spots, W, H, top }: { spots: DecoSpot3[]; W: number; H: number; top: number }): ReactElement | null {
  if (!spots.length) return null;
  const S = Math.min(W, H);
  return (
    <div aria-hidden="true" data-ev-depth="" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {spots.map((s, i) => {
        const size = S * s.size;
        const p = spotXY(s.at, size, W, H, top);
        return <DecoItem key={i} kind={s.kind} x={p.x} y={p.y} size={size} rot={s.rot} c={s.color} c2={s.color2 ?? "#ffffff"} />;
      })}
    </div>
  );
}

// ------------------------------------------------------------------ kits de datas comemorativas

export interface SeasonKit3 {
  id: KitId3;
  label: string;
  /** elementos dos cantos do cabeçalho (cortados pela borda) */
  corners: Array<{ kind: DecoKind3; side: "l" | "r"; size: number; dy: number; rot: number; c: string; c2: string }>;
  /** faixa decorativa na borda inferior do cabeçalho */
  band?: { colors: string[] };
  /** cores do fundo do cabeçalho (as camadas do modelo continuam); ausente = cores do modelo */
  header?: { base: string; light: string; dark: string };
}

export const SEASON_KITS: Record<KitId3, SeasonKit3> = {
  natal: {
    id: "natal", label: "Natal",
    corners: [
      { kind: "ornament", side: "l", size: 0.36, dy: -0.12, rot: -8, c: "#d61f2c", c2: "#f4c542" },
      { kind: "star", side: "r", size: 0.3, dy: 0.02, rot: 12, c: "#f4c542", c2: "#8a5a00" },
      { kind: "snowflake", side: "r", size: 0.22, dy: 0.55, rot: 0, c: "#ffffff", c2: "#cfe8ff" },
    ],
    band: { colors: ["#d61f2c", "#ffffff"] },
  },
  pascoa: {
    id: "pascoa", label: "Páscoa",
    corners: [
      { kind: "egg", side: "l", size: 0.34, dy: 0.1, rot: -14, c: "#8e5bd8", c2: "#ffd84d" },
      { kind: "egg", side: "r", size: 0.3, dy: -0.05, rot: 16, c: "#3fb6a8", c2: "#ff8fb1" },
      { kind: "flower", side: "r", size: 0.2, dy: 0.62, rot: 0, c: "#ffd84d", c2: "#ff8fb1" },
    ],
    band: { colors: ["#8e5bd8", "#ffd84d"] },
    header: { base: "#6a3fb5", light: "#9a74e0", dark: "#2e1462" },
  },
  maes: {
    id: "maes", label: "Dia das Mães",
    corners: [
      { kind: "heart", side: "l", size: 0.3, dy: 0.05, rot: -12, c: "#e8457a", c2: "#ffffff" },
      { kind: "flower", side: "r", size: 0.32, dy: -0.06, rot: 10, c: "#ff9fc0", c2: "#ffd84d" },
      { kind: "heart", side: "r", size: 0.16, dy: 0.62, rot: 14, c: "#ffffff", c2: "#e8457a" },
    ],
    band: { colors: ["#e8457a", "#ffffff"] },
    header: { base: "#d63a73", light: "#f57aa6", dark: "#7a1238" },
  },
  blackfriday: {
    id: "blackfriday", label: "Black Friday",
    corners: [
      { kind: "bolt", side: "l", size: 0.34, dy: -0.04, rot: -10, c: "#ffd400", c2: "#111111" },
      { kind: "tag", side: "r", size: 0.34, dy: 0.0, rot: 18, c: "#111111", c2: "#ffd400" },
      { kind: "percent", side: "r", size: 0.2, dy: 0.6, rot: -8, c: "#ffd400", c2: "#111111" },
    ],
    band: { colors: ["#111111", "#ffd400"] },
    header: { base: "#151515", light: "#3a3a3a", dark: "#000000" },
  },
  arraia: {
    id: "arraia", label: "Arraiá",
    corners: [
      { kind: "flag", side: "l", size: 0.42, dy: -0.18, rot: 0, c: "#e63946", c2: "#2a9d8f" },
      { kind: "flag", side: "r", size: 0.42, dy: -0.18, rot: 0, c: "#f4a261", c2: "#3a86ff" },
      { kind: "flame", side: "r", size: 0.22, dy: 0.58, rot: 0, c: "#ff7a00", c2: "#ffd400" },
    ],
    band: { colors: ["#e63946", "#f4a261", "#2a9d8f", "#3a86ff"] },
    header: { base: "#e07a1f", light: "#f6a94d", dark: "#7a3a06" },
  },
};

/** Cantos do cabeçalho de um kit (px dentro do retângulo do cabeçalho). */
export function KitCorners({ kit, x, y, w, h }: { kit: SeasonKit3; x: number; y: number; w: number; h: number }): ReactElement {
  const S = Math.min(h, w * 0.4);
  return (
    <div aria-hidden="true" data-ev-kit={kit.id} style={{ position: "absolute", left: r1(x), top: r1(y), width: r1(w), height: r1(h), overflow: "hidden" }}>
      {kit.corners.map((c, i) => {
        const s = S * c.size * 1.9;
        const px = c.side === "l" ? -s * 0.3 : w - s * 0.7;
        return <DecoItem key={i} kind={c.kind} x={px} y={h * c.dy} size={s} rot={c.rot} c={c.c} c2={c.c2} />;
      })}
    </div>
  );
}

/** Aplica um kit sazonal a um visual: só cabeçalho e cantos mudam (o corpo continua neutro). */
export function withKit(look: Look3, kit: KitId3): Look3 {
  return { ...look, kit };
}
