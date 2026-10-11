// Objetos temáticos ORIGINAIS (SVG desenhado para este projeto) que "vazam" do cabeçalho.
// Formas simples com sombreamento por gradiente, brilho e sombra no chão. Nenhuma arte de terceiros.
import type { CSSProperties, ReactElement } from "react";
import type { ObjectKind } from "./look";

const R = (k: string) => `ev2-${k}`;

/** Gradientes compartilhados (ids estáveis: o mesmo conteúdo pode se repetir em várias páginas). */
function Defs() {
  const lin = (id: string, stops: Array<[number, string, number?]>, x2 = 0, y2 = 1) => (
    <linearGradient id={R(id)} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
    </linearGradient>
  );
  const rad = (id: string, stops: Array<[number, string, number?]>, cx = 0.35, cy = 0.3) => (
    <radialGradient id={R(id)} cx={cx} cy={cy} r="0.75">
      {stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
    </radialGradient>
  );
  return (
    <defs>
      {rad("red", [[0, "#ff6b57"], [0.55, "#e0261b"], [1, "#8e0f0a"]])}
      {rad("orange", [[0, "#ffd27a"], [0.55, "#ff9a1f"], [1, "#c25b00"]])}
      {rad("green", [[0, "#9be36b"], [0.55, "#3fa535"], [1, "#1d5e1a"]])}
      {rad("apple", [[0, "#ff8a7a"], [0.5, "#d81f2a"], [1, "#7a0910"]])}
      {rad("gold", [[0, "#fff3b0"], [0.5, "#f5c22b"], [1, "#a8740a"]])}
      {rad("goldball", [[0, "#fff7c9"], [0.45, "#f0b81c"], [1, "#8a5a00"]])}
      {rad("greenball", [[0, "#7fe0a2"], [0.45, "#13894a"], [1, "#04381b"]])}
      {rad("grape", [[0, "#b98be0"], [0.5, "#6a2d9a"], [1, "#2f0c4d"]])}
      {rad("meat", [[0, "#ff7d6e"], [0.5, "#c62a2a"], [1, "#6d0c10"]])}
      {rad("bubble", [[0, "#ffffff", 0.1], [0.75, "#ffffff", 0.08], [1, "#ffffff", 0.7]], 0.5, 0.5)}
      {lin("wood", [[0, "#e2a865"], [0.5, "#c07a37"], [1, "#8a4f1c"]])}
      {lin("woodDark", [[0, "#9a5a24"], [1, "#5e3412"]])}
      {lin("metal", [[0, "#f4f6f8"], [0.35, "#c9d1d8"], [0.7, "#8e99a3"], [1, "#e1e6ea"]], 1, 0)}
      {lin("steel", [[0, "#6b7680"], [0.5, "#2d343a"], [1, "#111518"]], 1, 0)}
      {lin("basket", [[0, "#ff5a4a"], [1, "#a3120c"]])}
      {lin("bread", [[0, "#f6c46e"], [0.45, "#d58a35"], [1, "#8c4a13"]])}
      {lin("crust", [[0, "#e7a14d"], [1, "#9a5518"]], 1, 1)}
      {lin("wheat", [[0, "#ffe08a"], [1, "#c98a1a"]])}
      {lin("glassG", [[0, "#3f8f4f"], [0.5, "#14532d"], [1, "#062a15"]], 1, 0)}
      {lin("glassA", [[0, "#e7a33a"], [0.5, "#a35f0d"], [1, "#4f2b03"]], 1, 0)}
      {lin("glassW", [[0, "#2e4a33"], [0.5, "#0f2416"], [1, "#050d08"]], 1, 0)}
      {lin("ice", [[0, "#ffffff", 0.95], [0.5, "#bdefff", 0.7], [1, "#7fd7f2", 0.6]], 1, 1)}
      {lin("flame", [[0, "#fff3a0"], [0.35, "#ffc21a"], [0.7, "#ff6a00"], [1, "#d62000", 0.2]], 0, -1)}
      {lin("flameUp", [[0, "#d62000", 0.1], [0.3, "#ff6a00"], [0.7, "#ffc21a"], [1, "#fff6b0"]], 0, 1)}
      {lin("box", [[0, "#e6b77c"], [1, "#b47b3e"]])}
      {lin("boxSide", [[0, "#c4914f"], [1, "#8e5c26"]])}
      {lin("boxTop", [[0, "#f3d3a3"], [1, "#d9a865"]])}
      {lin("gift", [[0, "#ff3d3d"], [1, "#9c0712"]])}
      {lin("giftTop", [[0, "#ff6a5f"], [1, "#d01b22"]])}
      {lin("ribbonG", [[0, "#fff1a6"], [0.5, "#f2bd1d"], [1, "#b47c00"]], 1, 0)}
      {lin("mega", [[0, "#ff5b4d"], [0.55, "#d7140b"], [1, "#7e0703"]])}
      {lin("megaRim", [[0, "#ffffff"], [1, "#c9ced4"]], 1, 0)}
      {lin("spray", [[0, "#7ff3e2"], [0.5, "#17b8a6"], [1, "#0b6e66"]], 1, 0)}
      {lin("sprayHead", [[0, "#ffffff"], [1, "#c9b6f2"]], 1, 0)}
      {lin("sponge", [[0, "#ffe66b"], [1, "#e0a800"]])}
      {lin("bag", [[0, "#ff6f61"], [1, "#c2261c"]])}
      {lin("bagSide", [[0, "#c2261c"], [1, "#7c1009"]])}
      {lin("tagY", [[0, "#ffe45c"], [1, "#f2a900"]], 1, 1)}
      {lin("coin", [[0, "#fff1a1"], [0.5, "#f1b91f"], [1, "#a87200"]], 1, 0)}
      {lin("label", [[0, "#fffaf0"], [1, "#efe2c4"]])}
      {lin("wine", [[0, "#c2185b", 0.9], [1, "#5b0a26"]])}
      {lin("cheese", [[0, "#ffe680"], [1, "#f2b705"]])}
      {lin("milk", [[0, "#ffffff"], [1, "#d9e2ec"]], 1, 0)}
      <filter id={R("soft")} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter>
    </defs>
  );
}

const shadow = (cx = 100, cy = 188, rx = 78) => <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.1} fill="#000" opacity={0.3} filter={`url(#${R("soft")})`} />;
const shine = (d: string, w = 5, o = 0.6) => <path d={d} stroke="#fff" strokeWidth={w} strokeLinecap="round" fill="none" opacity={o} />;

function leaf(x: number, y: number, s: number, rot: number, fill = `url(#${R("green")})`) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 0C10-14 34-16 50 0 34 16 10 14 0 0Z" fill={fill} />
      <path d="M2 0H44" stroke="#1d5e1a" strokeWidth="1.6" opacity=".55" />
    </g>
  );
}
function tomato(x: number, y: number, r: number) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={`url(#${R("red")})`} />
      <ellipse cx={x - r * 0.38} cy={y - r * 0.4} rx={r * 0.28} ry={r * 0.17} fill="#fff" opacity=".55" transform={`rotate(-30 ${x - r * 0.38} ${y - r * 0.4})`} />
      <path d={`M${x} ${y - r * 1.02}l${r * 0.22} ${r * 0.3} ${r * 0.36}-${r * 0.1}-${r * 0.2} ${r * 0.3} ${r * 0.3} ${r * 0.18}-${r * 0.38} ${r * 0.04}-${r * 0.3} ${r * 0.24}-${r * 0.3}-${r * 0.24}-${r * 0.38}-${r * 0.04} ${r * 0.3}-${r * 0.18}-${r * 0.2}-${r * 0.3} ${r * 0.36} ${r * 0.1}z`} fill="#2f8a2a" />
    </g>
  );
}
function orange(x: number, y: number, r: number) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={`url(#${R("orange")})`} />
      <circle cx={x - r * 0.35} cy={y - r * 0.38} r={r * 0.2} fill="#fff" opacity=".45" />
      <circle cx={x + r * 0.1} cy={y - r * 0.85} r={r * 0.09} fill="#6b4a12" />
    </g>
  );
}
function apple(x: number, y: number, r: number) {
  return (
    <g>
      <path d={`M${x} ${y - r * 0.7}c-${r * 0.6}-${r * 0.45}-${r * 1.05} 0-${r * 1.05} ${r * 0.55}s${r * 0.5} ${r * 1.2} ${r * 0.8} ${r * 1.15}c${r * 0.12} 0 ${r * 0.15}-${r * 0.07} ${r * 0.25}-${r * 0.07}s${r * 0.13} ${r * 0.07} ${r * 0.25} ${r * 0.07}c${r * 0.3} 0 ${r * 0.8}-${r * 0.6} ${r * 0.8}-${r * 1.15}s-${r * 0.45}-${r}-${r * 1.05}-${r * 0.55}z`} fill={`url(#${R("apple")})`} />
      <path d={`M${x} ${y - r * 0.7}q${r * 0.05}-${r * 0.35} ${r * 0.25}-${r * 0.5}`} stroke="#5a3a1a" strokeWidth={r * 0.12} strokeLinecap="round" fill="none" />
      {leaf(x + r * 0.2, y - r * 1.05, r / 55, -25)}
      <ellipse cx={x - r * 0.45} cy={y - r * 0.1} rx={r * 0.14} ry={r * 0.3} fill="#fff" opacity=".45" />
    </g>
  );
}
function wheatStalk(x: number, y: number, len: number, rot: number) {
  const grains = [0.18, 0.3, 0.42, 0.54, 0.66];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={`M0 0V-${len}`} stroke="#c98a1a" strokeWidth="2.5" />
      {grains.map((g) => (
        <g key={g} fill={`url(#${R("wheat")})`} stroke="#a86c0c" strokeWidth=".6">
          <ellipse cx="-6" cy={-len + g * len * 0.9} rx="4.6" ry="9" transform={`rotate(-26 -6 ${-len + g * len * 0.9})`} />
          <ellipse cx="6" cy={-len + g * len * 0.9} rx="4.6" ry="9" transform={`rotate(26 6 ${-len + g * len * 0.9})`} />
        </g>
      ))}
      <ellipse cx="0" cy={-len - 4} rx="4" ry="9" fill={`url(#${R("wheat")})`} />
      {[-1, 1].map((s) => <path key={s} d={`M0 ${-len - 6}l${s * 6}-14`} stroke="#d9a53a" strokeWidth="1" />)}
    </g>
  );
}
function bottle(x: number, y: number, s: number, glass: string, rot = 0) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-9-96h18v26c0 8 15 14 15 30v110c0 6-4 10-10 10h-28c-6 0-10-4-10-10V-40c0-16 15-22 15-30z" fill={`url(#${R(glass)})`} />
      <rect x="-11" y="-104" width="22" height="10" rx="2" fill={`url(#${R("ribbonG")})`} />
      <path d="M-15-30v90" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".45" />
      <path d="M-4-90v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity=".5" />
    </g>
  );
}
function iceCube(x: number, y: number, s: number, rot: number) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.18} fill={`url(#${R("ice")})`} stroke="#fff" strokeWidth="1.5" />
      <path d={`M${-s * 0.3} ${-s * 0.15}q0-${s * 0.15} ${s * 0.15}-${s * 0.17}`} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </g>
  );
}
function star4(x: number, y: number, s: number, fill = "#fff") {
  return <path d={`M${x} ${y - s}Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y}Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s}Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y}Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`} fill={fill} />;
}

const DRAW: Record<ObjectKind, () => ReactElement> = {
  cart: () => (
    <g>
      {shadow(104, 190, 80)}
      {/* compras saindo do carrinho */}
      <g transform="rotate(-24 128 60)"><rect x="104" y="14" width="30" height="92" rx="15" fill={`url(#${R("bread")})`} />{[30, 50, 70].map((yy) => <path key={yy} d={`M110 ${yy}q8-6 18 0`} stroke="#ffe2a8" strokeWidth="4" strokeLinecap="round" fill="none" />)}</g>
      <g><path d="M48 76V36h26v40z" fill={`url(#${R("milk")})`} stroke="#b9c6d3" /><path d="M48 36l13-14 13 14z" fill="#dfe7ef" /><rect x="48" y="50" width="26" height="14" fill="#2f7fd1" /></g>
      {leaf(66, 74, 0.9, -110)}{leaf(70, 74, 0.8, -70)}{leaf(62, 74, 0.7, -140)}
      {apple(96, 72, 15)}{orange(150, 70, 14)}{tomato(122, 76, 13)}
      {/* cesto */}
      <path d="M26 70h158l-20 74H50z" fill={`url(#${R("basket")})`} />
      <g stroke="#fff" strokeOpacity=".35" strokeWidth="3">{[56, 80, 104, 128, 152].map((xx, i) => <path key={xx} d={`M${xx} 74l${-4 + i * 2} 66`} />)}<path d="M34 94h144M40 118h132" /></g>
      <path d="M20 70h170" stroke="#7a0b06" strokeWidth="9" strokeLinecap="round" />
      <path d="M22 68h166" stroke="#ff8c7f" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      <path d="M186 70l8-34h8" stroke={`url(#${R("steel")})`} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 144l8 20h112" stroke={`url(#${R("steel")})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {[72, 152].map((cx) => <g key={cx}><circle cx={cx} cy="176" r="12" fill="#1b1b1b" /><circle cx={cx} cy="176" r="5" fill="#b8c0c8" /><path d={`M${cx - 6} 170a8 8 0 0 1 8-3`} stroke="#666" strokeWidth="2" fill="none" /></g>)}
      {shine("M40 82l6 22", 4, 0.5)}
    </g>
  ),
  crate: () => (
    <g>
      {shadow(100, 190, 86)}
      {leaf(40, 92, 1.4, -150)}{leaf(150, 88, 1.3, -30)}{leaf(98, 70, 1.2, -95)}
      <g transform="rotate(-35 150 70)"><path d="M140 40l10 64 10-64z" fill={`url(#${R("orange")})`} /><path d="M150 40l-8-16M150 40l2-18M150 40l10-14" stroke="#2f8a2a" strokeWidth="5" strokeLinecap="round" /></g>
      {tomato(62, 96, 22)}{orange(104, 90, 22)}{tomato(142, 98, 20)}{apple(84, 112, 18)}{orange(124, 116, 16)}
      {/* caixote */}
      <path d="M18 112h164l-8 76H26z" fill={`url(#${R("wood")})`} />
      {[126, 150, 172].map((yy) => <rect key={yy} x="22" y={yy} width="156" height="3" fill="#6b3a12" opacity=".7" />)}
      <rect x="18" y="108" width="164" height="12" rx="3" fill={`url(#${R("woodDark")})`} />
      <rect x="22" y="108" width="14" height="80" fill={`url(#${R("woodDark")})`} /><rect x="164" y="108" width="14" height="80" fill={`url(#${R("woodDark")})`} />
      {[[29, 116], [171, 116], [29, 180], [171, 180]].map(([cx, cy]) => <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="2" fill="#3a1d06" />)}
      {shine("M44 134h70", 3, 0.35)}
    </g>
  ),
  grill: () => (
    <g>
      {shadow(100, 192, 74)}
      {/* chamas */}
      {[[50, 30], [76, 14], [102, 6], [128, 16], [152, 32]].map(([x, top], i) => (
        <path key={i} d={`M${x - 20} 112C${x - 24} ${top + 50} ${x - 4} ${top + 40} ${x} ${top}C${x + 10} ${top + 36} ${x + 26} ${top + 46} ${x + 20} 112z`} fill={`url(#${R("flameUp")})`} />
      ))}
      {/* churrasqueira */}
      <path d="M22 116h156c0 34-30 52-78 52S22 150 22 116z" fill={`url(#${R("steel")})`} />
      <path d="M40 160l-12 28M160 160l12 28M100 168v22" stroke="#1d2226" strokeWidth="7" strokeLinecap="round" />
      <rect x="16" y="108" width="168" height="10" rx="5" fill="#2b3135" />
      <g stroke="#9aa4ac" strokeWidth="2.4">{[34, 54, 74, 94, 114, 134, 154, 172].map((xx) => <path key={xx} d={`M${xx} 106v-4`} />)}</g>
      {/* bife */}
      <path d="M38 104c-6-22 16-38 46-36 28 2 44 14 38 30-4 10-28 12-50 12-16 0-30 2-34-6z" fill={`url(#${R("meat")})`} stroke="#fff1e0" strokeWidth="5" />
      <g stroke="#3a0d06" strokeWidth="4" strokeLinecap="round" opacity=".75">{[56, 74, 92].map((xx) => <path key={xx} d={`M${xx} 78l14 22`} />)}</g>
      {/* linguiça */}
      <rect x="120" y="86" width="58" height="18" rx="9" fill="#b23a1c" /><rect x="120" y="86" width="58" height="8" rx="4" fill="#e0603a" opacity=".6" />
      <g stroke="#3a0d06" strokeWidth="3" strokeLinecap="round" opacity=".7">{[134, 148, 162].map((xx) => <path key={xx} d={`M${xx} 88l6 14`} />)}</g>
      <path d="M70 40q-10-14 4-26M110 30q-10-14 4-26" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".35" />
    </g>
  ),
  bread: () => (
    <g>
      {shadow(100, 186, 84)}
      {wheatStalk(40, 150, 110, -18)}{wheatStalk(56, 152, 120, -6)}{wheatStalk(160, 150, 112, 20)}
      <g transform="rotate(-28 120 110)"><rect x="40" y="96" width="160" height="30" rx="15" fill={`url(#${R("crust")})`} />{[70, 100, 130, 160].map((xx) => <path key={xx} d={`M${xx} 104q10-4 18 6`} stroke="#ffe0a3" strokeWidth="4" strokeLinecap="round" fill="none" />)}</g>
      <path d="M22 160c-6-50 34-78 78-78s86 28 78 78c-2 14-12 22-26 22H48c-14 0-24-8-26-22z" fill={`url(#${R("bread")})`} />
      <path d="M26 164c6 10 12 16 24 16h100c12 0 20-6 26-16" fill="#8c4a13" opacity=".45" />
      {[60, 92, 124, 152].map((xx, i) => <path key={xx} d={`M${xx - 14} ${112 + (i % 2) * 4}q14-14 30 4`} stroke="#ffe3ad" strokeWidth="7" strokeLinecap="round" fill="none" />)}
      {shine("M44 124q20-24 50-28", 5, 0.4)}
      {[[70, 98], [118, 94], [96, 140], [140, 128]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="#fff" opacity=".7" />)}
    </g>
  ),
  bucket: () => (
    <g>
      {shadow(100, 192, 74)}
      {bottle(76, 112, 0.95, "glassG", -12)}{bottle(122, 108, 0.95, "glassA", 10)}{bottle(100, 116, 0.82, "glassG", 2)}
      {iceCube(50, 100, 22, -14)}{iceCube(150, 98, 24, 16)}{iceCube(86, 104, 18, 30)}{iceCube(124, 106, 20, -20)}
      <path d="M26 100h148l-16 86H42z" fill={`url(#${R("metal")})`} />
      <path d="M30 116h140M36 168h128" stroke="#7d8892" strokeWidth="4" />
      <path d="M22 100h156" stroke="#aab4bd" strokeWidth="8" strokeLinecap="round" />
      <path d="M24 112c-14 0-14 22 0 22M176 112c14 0 14 22 0 22" stroke="#8e99a3" strokeWidth="5" fill="none" />
      {shine("M54 124l6 48", 6, 0.6)}
      {[[40, 140], [160, 132], [70, 178], [140, 160]].map(([x, y]) => <path key={`${x}${y}`} d={`M${x} ${y}q4 6 0 9q-4-3 0-9z`} fill="#dff7ff" opacity=".9" />)}
    </g>
  ),
  megaphone: () => (
    <g>
      {shadow(100, 188, 70)}
      <g stroke="#ffd400" strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M28 56q-14 30 0 60" /><path d="M12 42q-22 44 0 88" opacity=".7" />
      </g>
      <path d="M56 70l100-44v124L56 106z" fill={`url(#${R("mega")})`} />
      <ellipse cx="156" cy="88" rx="16" ry="62" fill={`url(#${R("megaRim")})`} />
      <ellipse cx="156" cy="88" rx="8" ry="48" fill="#7e0703" />
      <rect x="38" y="66" width="22" height="44" rx="6" fill="#2b2b2b" />
      <path d="M90 104l-6 46h22l10-40" fill="#2b2b2b" />
      {shine("M66 76l80-36", 5, 0.45)}
      {star4(176, 28, 10, "#ffd400")}{star4(40, 150, 8, "#fff")}{star4(186, 150, 7, "#ffd400")}
    </g>
  ),
  gift: () => (
    <g>
      {shadow(100, 190, 80)}
      <path d="M34 98h132v84H34z" fill={`url(#${R("gift")})`} />
      <path d="M26 80h148v22H26z" fill={`url(#${R("giftTop")})`} />
      <rect x="88" y="80" width="24" height="102" fill={`url(#${R("ribbonG")})`} />
      <rect x="34" y="128" width="132" height="16" fill={`url(#${R("ribbonG")})`} opacity=".95" />
      <path d="M100 80c-30-36-58-18-44-2 8 9 30 6 44 2zM100 80c30-36 58-18 44-2-8 9-30 6-44 2z" fill={`url(#${R("ribbonG")})`} stroke="#9a6a00" strokeWidth="1.5" />
      <circle cx="100" cy="80" r="8" fill="#e0a800" />
      {shine("M40 104v66", 5, 0.35)}
      <path d="M170 0v38M150 0v62" stroke="#c8a24a" strokeWidth="1.5" />
      <g><circle cx="170" cy="52" r="15" fill={`url(#${R("greenball")})`} /><rect x="165" y="34" width="10" height="6" rx="1" fill={`url(#${R("ribbonG")})`} /></g>
      <g><circle cx="150" cy="74" r="12" fill={`url(#${R("goldball")})`} /><rect x="146" y="59" width="8" height="5" rx="1" fill="#c8a24a" /></g>
      {star4(40, 46, 14, "#ffe27a")}{star4(64, 24, 8, "#fff")}{star4(20, 150, 7, "#fff")}
    </g>
  ),
  wine: () => (
    <g>
      {shadow(100, 192, 82)}
      <g transform="translate(70 0)"><path d="M-13 8h26v44c0 10 22 18 22 44v84c0 6-5 10-11 10h-48c-6 0-11-4-11-10V96c0-26 22-34 22-44z" fill={`url(#${R("glassW")})`} /><rect x="-14" y="4" width="28" height="34" rx="3" fill={`url(#${R("ribbonG")})`} /><rect x="-26" y="112" width="52" height="46" rx="4" fill={`url(#${R("label")})`} stroke="#c8a24a" strokeWidth="2" /><path d="M-16 124h32M-12 134h24M-16 144h32" stroke="#c8a24a" strokeWidth="2" opacity=".7" />{shine("M-22 100v70", 4, 0.3)}</g>
      <g><path d="M118 92h44c0 30-8 46-22 46s-22-16-22-46z" fill="#ffffff" opacity=".25" stroke="#fff" strokeWidth="2" /><path d="M120 108h40c-2 20-9 28-20 28s-18-8-20-28z" fill={`url(#${R("wine")})`} /><path d="M140 138v34M126 176h28" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".8" />{shine("M126 98q-2 16 4 28", 3, 0.6)}</g>
      <g><path d="M120 186l58-30 6 16v14z" fill={`url(#${R("cheese")})`} /><path d="M120 186l58-30-8-4-56 28z" fill="#fff3b8" />{[[150, 178, 4], [168, 176, 3], [138, 183, 2.6]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#e0a000" />)}</g>
      {[[34, 160], [44, 168], [26, 170], [38, 178], [48, 156]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="8" fill={`url(#${R("grape")})`} />)}
      {star4(164, 40, 9, "#ffe7a0")}{star4(30, 60, 7, "#fff")}
    </g>
  ),
  pallet: () => (
    <g>
      {shadow(100, 194, 90)}
      <rect x="14" y="170" width="172" height="8" fill={`url(#${R("wood")})`} /><rect x="14" y="184" width="172" height="8" fill={`url(#${R("wood")})`} />
      {[18, 92, 168].map((x) => <rect key={x} x={x} y="176" width="14" height="10" fill={`url(#${R("woodDark")})`} />)}
      {[[20, 112, 76, 58], [100, 112, 80, 58], [52, 50, 90, 62]].map(([x, y, w, h], i) => (
        <g key={i}>
          <path d={`M${x} ${y}h${w}v${h}h-${w}z`} fill={`url(#${R("box")})`} />
          <path d={`M${x} ${y}l10-10h${w}l-10 10z`} fill={`url(#${R("boxTop")})`} />
          <path d={`M${x + w} ${y}l10-10v${h}l-10 10z`} fill={`url(#${R("boxSide")})`} />
          <rect x={x + w / 2 - 7} y={y} width="14" height={h} fill="#d9b27a" opacity=".85" />
          <path d={`M${x + 10} ${y + h - 18}v-12l-5 5m5-5l5 5M${x + 22} ${y + h - 18}v-12l-5 5m5-5l5 5`} stroke="#5e3412" strokeWidth="2" fill="none" />
        </g>
      ))}
    </g>
  ),
  spray: () => (
    <g>
      {shadow(100, 190, 80)}
      <path d="M60 70h44l8 26v84c0 6-4 10-10 10H62c-6 0-10-4-10-10V96z" fill={`url(#${R("spray")})`} />
      <rect x="58" y="110" width="50" height="46" rx="6" fill="#fff" opacity=".9" />
      <path d="M68 124h30M68 136h20" stroke="#17b8a6" strokeWidth="5" strokeLinecap="round" />
      <path d="M64 42h44l18 10v14H64z" fill={`url(#${R("sprayHead")})`} />
      <path d="M70 66v-8h28v12z" fill="#7a4fd1" />
      <path d="M78 66l-10 26" stroke="#7a4fd1" strokeWidth="7" strokeLinecap="round" />
      <rect x="120" y="50" width="12" height="8" rx="2" fill="#7a4fd1" />
      {shine("M58 100v70", 5, 0.5)}
      <g><path d="M122 158h62v26h-62z" fill={`url(#${R("sponge")})`} /><path d="M122 150h62v10h-62z" fill="#2fa84f" />{[[132, 168], [150, 176], [168, 166], [176, 178]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.4" fill="#c89200" />)}</g>
      {[[150, 40, 16], [176, 70, 11], [140, 92, 8], [30, 70, 13], [24, 120, 9], [168, 118, 7]].map(([x, y, r]) => (
        <g key={`${x}${y}`}><circle cx={x} cy={y} r={r} fill={`url(#${R("bubble")})`} stroke="#fff" strokeWidth="1.5" /><ellipse cx={x - r * 0.35} cy={y - r * 0.4} rx={r * 0.3} ry={r * 0.16} fill="#fff" transform={`rotate(-35 ${x - r * 0.35} ${y - r * 0.4})`} /></g>
      ))}
    </g>
  ),
  bag: () => (
    <g>
      {shadow(100, 192, 80)}
      <path d="M74 60V48a26 26 0 0 1 52 0v12" stroke="#7c1009" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M40 60h110l6 126H34z" fill={`url(#${R("bag")})`} />
      <path d="M150 60l26 14 4 104-24 8z" fill={`url(#${R("bagSide")})`} />
      <path d="M150 60l26 14" stroke="#ffd1cc" strokeWidth="2" />
      <circle cx="74" cy="76" r="4" fill="#7c1009" /><circle cx="126" cy="76" r="4" fill="#7c1009" />
      <path d="M74 76V60M126 76V60" stroke="#7c1009" strokeWidth="5" />
      <g transform="rotate(14 120 132)"><path d="M100 110h52l10 22-10 22h-52z" fill={`url(#${R("tagY")})`} /><circle cx="150" cy="132" r="4" fill="#7c1009" /><circle cx="114" cy="124" r="5" fill="none" stroke="#1b1b1b" strokeWidth="3.5" /><circle cx="132" cy="142" r="5" fill="none" stroke="#1b1b1b" strokeWidth="3.5" /><path d="M134 120l-22 26" stroke="#1b1b1b" strokeWidth="4" strokeLinecap="round" /></g>
      {shine("M48 72l-4 100", 6, 0.35)}
      {star4(176, 40, 10, "#fff")}{star4(26, 90, 7, "#ffd400")}
    </g>
  ),
  pricetag: () => (
    <g>
      {shadow(100, 190, 80)}
      {[0, 1, 2, 3, 4].map((i) => <g key={i}><ellipse cx="140" cy={178 - i * 11} rx="34" ry="10" fill="#a87200" /><ellipse cx="140" cy={174 - i * 11} rx="34" ry="10" fill={`url(#${R("coin")})`} /></g>)}
      <path d="M140 126m-14 0a14 4 0 1 0 28 0" stroke="#a87200" strokeWidth="2" fill="none" />
      <g transform="rotate(-16 80 96)">
        <path d="M24 60h86l34 36-34 36H24c-6 0-10-4-10-10V70c0-6 4-10 10-10z" fill={`url(#${R("tagY")})`} stroke="#b07700" strokeWidth="2" />
        <circle cx="120" cy="96" r="8" fill="#5a3a00" opacity=".85" /><circle cx="120" cy="96" r="4" fill="#fff6c4" />
        <circle cx="50" cy="80" r="11" fill="none" stroke="#1b1b1b" strokeWidth="7" /><circle cx="86" cy="112" r="11" fill="none" stroke="#1b1b1b" strokeWidth="7" />
        <path d="M90 74l-44 44" stroke="#1b1b1b" strokeWidth="8" strokeLinecap="round" />
        {shine("M28 66h70", 4, 0.5)}
      </g>
      <path d="M120 66q30-40 60-30" stroke="#5a3a00" strokeWidth="2.5" fill="none" />
      {star4(178, 92, 9, "#fff")}{star4(28, 160, 8, "#fff3a0")}
    </g>
  ),
};

/** Desenha o objeto temático numa caixa (proporção preservada). */
export function ThemeObject({ kind, x, y, w, h, flip = false, style }: { kind: ObjectKind; x: number; y: number; w: number; h: number; flip?: boolean; style?: CSSProperties }) {
  return (
    <svg data-ev-object={kind} aria-hidden="true" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet"
      style={{ position: "absolute", left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), overflow: "visible", transform: flip ? "scaleX(-1)" : undefined, filter: "drop-shadow(0 4px 6px rgba(0,0,0,.35))", ...style }}>
      <Defs />
      {DRAW[kind]()}
    </svg>
  );
}
