// Fundo em camadas (v3): degradê + coleção de camadas (listras diagonais, raios, pontinhos, palavra da
// campanha repetida bem clara, quadriculado, ondas, confete e as texturas da v2: madeira, papel, kraft...).
// Nunca cor chapada. Intensidade ajustável por modelo (Ground3.intensity). Tudo desenhado em código.
import type { CSSProperties, ReactElement } from "react";
import { alpha } from "../parts/color";
import { GroundFill } from "../parts2/grounds";
import { fontStack, r1, textWidth, type Face } from "../parts2/measure";
import { rng } from "../parts2/look";
import type { Ground3, Layer3 } from "./look3";

const full: CSSProperties = { position: "absolute", inset: 0 };
const WORD_FACE: Face = { family: "Anton", weight: 400 };

function baseBackground(g: Ground3, focus: string): string {
  switch (g.gradient) {
    case "linear": return `linear-gradient(165deg, ${g.light} 0%, ${g.base} 55%, ${g.dark} 100%)`;
    case "flat-ish": return `linear-gradient(180deg, ${g.light} 0%, ${g.base} 100%)`;
    default: return `radial-gradient(ellipse 80% 85% at ${focus}, ${g.light} 0%, ${g.base} 50%, ${g.dark} 100%)`;
  }
}

function LayerEl({ l, k, w, h, g, word, seed, focus }: { l: Layer3; k: number; w: number; h: number; g: Ground3; word: string; seed: number; focus: string }): ReactElement | null {
  const S = Math.min(w, h);
  const op = Math.max(0, Math.min(1, l.opacity * g.intensity));
  if (op <= 0.001) return null;
  const sc = l.scale ?? 1;
  switch (l.kind) {
    case "stripes": {
      const d = Math.max(8, (S / 18) * sc);
      return <div key={k} style={{ ...full, opacity: op, backgroundImage: `repeating-linear-gradient(${l.angle ?? 135}deg, ${l.color} 0 ${r1(d * 0.42)}px, transparent ${r1(d * 0.42)}px ${r1(d)}px)` }} />;
    }
    case "rays": {
      const step = 9 / sc;
      const at = l.focus ?? focus;
      const mask = `radial-gradient(ellipse 85% 95% at ${at}, #000 0%, rgba(0,0,0,.6) 45%, transparent 90%)`;
      return <div key={k} style={{ ...full, opacity: op, background: `repeating-conic-gradient(from ${l.angle ?? 0}deg at ${at}, ${l.color} 0deg ${r1(step * 0.48)}deg, transparent ${r1(step * 0.48)}deg ${r1(step)}deg)`, WebkitMaskImage: mask, maskImage: mask }} />;
    }
    case "dots": {
      const d = Math.max(6, (S / 30) * sc);
      return <div key={k} style={{ ...full, opacity: op, backgroundImage: `radial-gradient(circle, ${l.color} 0 ${r1(d * 0.2)}px, transparent ${r1(d * 0.22)}px)`, backgroundSize: `${r1(d)}px ${r1(d)}px` }} />;
    }
    case "grid": {
      const d = Math.max(10, (S / 16) * sc);
      return <div key={k} style={{ ...full, opacity: op, backgroundImage: `linear-gradient(${l.color} 1px, transparent 1px), linear-gradient(90deg, ${l.color} 1px, transparent 1px)`, backgroundSize: `${r1(d)}px ${r1(d)}px` }} />;
    }
    case "waves": {
      const amp = Math.max(4, (S / 40) * sc), per = amp * 7, gapY = amp * 4.2;
      const rows: ReactElement[] = [];
      let i = 0;
      for (let y = gapY * 0.5; y < h + gapY; y += gapY) {
        let d = `M${r1(-per)} ${r1(y)}`;
        for (let x = -per; x < w + per; x += per) d += `q${r1(per / 4)} ${r1(-amp)} ${r1(per / 2)} 0t${r1(per / 2)} 0`;
        rows.push(<path key={i++} d={d} fill="none" stroke={l.color} strokeWidth={r1(Math.max(1, amp * 0.35))} />);
      }
      return <svg key={k} aria-hidden="true" width={r1(w)} height={r1(h)} style={{ position: "absolute", left: 0, top: 0, opacity: op }}>{rows}</svg>;
    }
    case "confetti": {
      const rnd = rng(seed * 7 + 3);
      const n = Math.round(Math.min(120, (w * h) / (S * S) * 22));
      const items: ReactElement[] = [];
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, s = S * (0.008 + rnd() * 0.014) * sc, rot = Math.round(rnd() * 180);
        items.push(i % 2 ? <rect key={i} x={r1(x)} y={r1(y)} width={r1(s * 2)} height={r1(s * 0.8)} rx={r1(s * 0.2)} fill={l.color} transform={`rotate(${rot} ${r1(x)} ${r1(y)})`} /> : <circle key={i} cx={r1(x)} cy={r1(y)} r={r1(s * 0.6)} fill={l.color} />);
      }
      return <svg key={k} aria-hidden="true" width={r1(w)} height={r1(h)} style={{ position: "absolute", left: 0, top: 0, opacity: op }}>{items}</svg>;
    }
    case "word": {
      // palavra da campanha repetida em linhas inclinadas, bem clara (marca a peça sem disputar com o conteúdo)
      const text = (word || "OFERTA").toLocaleUpperCase("pt-BR");
      const fs = Math.max(14, (S / 9) * sc);
      const unit = textWidth(`${text} `, WORD_FACE, fs);
      const reps = Math.max(2, Math.ceil((w * 1.6) / Math.max(1, unit)) + 1);
      const line = Array.from({ length: reps }, () => text).join("  ");
      const rows: ReactElement[] = [];
      const diag = Math.hypot(w, h);
      for (let i = 0, y = -diag * 0.3; y < diag; y += fs * 1.35, i++) {
        rows.push(<div key={i} style={{ position: "absolute", left: r1(-diag * 0.3 - (i % 2) * unit * 0.5), top: r1(y), whiteSpace: "nowrap", fontFamily: fontStack(WORD_FACE.family), fontWeight: WORD_FACE.weight, fontSize: r1(fs), lineHeight: 1, color: l.color, letterSpacing: "0.02em" }}>{line}</div>);
      }
      return (
        <div key={k} style={{ ...full, opacity: op, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: r1(w), height: r1(h), transform: `rotate(${l.angle ?? -14}deg)`, transformOrigin: "50% 50%" }}>{rows}</div>
        </div>
      );
    }
    case "texture": {
      if (!l.texture) return null;
      return (
        <div key={k} style={{ ...full, opacity: op }}>
          <GroundFill g={{ kind: l.texture, base: g.base, light: g.light, dark: g.dark, accents: g.accents }} w={w} h={h} seed={seed} focus={focus} />
        </div>
      );
    }
  }
}

/** Fundo em camadas. `word` é a palavra principal da campanha (camada "word"). */
export function Layers3({ g, w, h, word = "", seed = 1, focus = "50% 40%" }: { g: Ground3; w: number; h: number; word?: string; seed?: number; focus?: string }): ReactElement {
  return (
    <div aria-hidden="true" data-ev-ground="" style={{ ...full, background: baseBackground(g, focus), overflow: "hidden" }}>
      {g.layers.map((l, i) => <LayerEl key={i} l={l} k={i} w={w} h={h} g={g} word={word} seed={seed + i} focus={focus} />)}
      {/* vinheta sutil: profundidade sem desfoque no conteúdo */}
      <div style={{ ...full, background: `radial-gradient(ellipse 90% 90% at ${focus}, transparent 55%, ${alpha(g.dark, 0.35 * Math.min(1, g.intensity))} 100%)` }} />
    </div>
  );
}
