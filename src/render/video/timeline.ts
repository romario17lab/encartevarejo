// Coreografia do vídeo (função PURA): transforma o plano em trilhas de quadros-chave que o
// runtime aplica na página. Cada trilha aponta para elementos por seletor CSS.
//
// Garantia de leitura: dentro de uma cena, o card de cada produto e o seu preço ficam PARADOS
// (sem movimento, escala, recorte ou transparência) do momento em que o preço termina de aparecer
// até o início da saída — pelo menos T.MIN_HOLD segundos (ver plan.ts). Nada passa por cima do preço
// nesse intervalo: a cena seguinte só começa a entrar quando a anterior já está saindo.
import { RUNTIME_CORE } from "./runtime";
import { T, pricesStillAt, type VideoPlan } from "./plan";
import type { VideoStyle } from "./options";

export type Ease = "linear" | "in" | "out" | "inout" | "back" | "step";
export interface Kf { t: number; e?: Ease; x?: number; y?: number; s?: number; r?: number; o?: number; c?: [number, number, number, number] | null }
export interface Track { id: string; sel: string; kf: Kf[]; hide?: boolean; clip?: boolean; role?: "cell" | "price" | "layer" | "deco" }

export interface Timeline { duration: number; fps: number; width: number; height: number; tracks: Track[] }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const q = (v: string) => `"${v.replace(/["\\]/g, "\\$&")}"`;
export const layerSel = (key: string) => `[data-v-el=${q(key)}]`;
export const cellSel = (sceneKey: string, itemId: string) => `${layerSel(sceneKey)} [data-ev-cell=${q(itemId)}]`;

type Pose = Omit<Kf, "t" | "e">;
const STILL: Pose = { x: 0, y: 0, s: 1, r: 0, o: 1, c: null };

/** Pose de entrada/saída de um card conforme o estilo. j = posição do card na cena. */
function enterPose(style: VideoStyle, j: number, W: number, H: number, vertical: boolean): Pose {
  switch (style) {
    case "deslizar": {
      const dir = vertical ? (j % 2 ? -1 : 1) : 1;
      return { x: dir * W * 0.9, o: 1 };
    }
    case "zoom": return { s: 0.62, o: 0 };
    case "cortina": return { c: [0, 100, 0, 0], x: -W * 0.03, o: 1 };
    case "subir": return { y: H * 0.55, o: 0 };
  }
}
function exitPose(style: VideoStyle, j: number, W: number, H: number, vertical: boolean): Pose {
  switch (style) {
    case "deslizar": {
      const dir = vertical ? (j % 2 ? 1 : -1) : -1;
      return { x: dir * W * 0.9, o: 1 };
    }
    case "zoom": return { s: 1.14, o: 0 };
    case "cortina": return { c: [0, 0, 0, 100], x: W * 0.03, o: 1 };
    case "subir": return { y: -H * 0.25, o: 0 };
  }
}
const enterEase = (style: VideoStyle): Ease => (style === "zoom" ? "back" : style === "cortina" ? "inout" : "out");

export function buildTimeline(plan: VideoPlan): Timeline {
  const { width: W, height: H, style } = plan;
  const vertical = plan.orientation === "vertical";
  const D = plan.durationSec;
  const tracks: Track[] = [];
  const intro = plan.scenes[0];
  const outro = plan.scenes[plan.scenes.length - 1];

  // fundo: aproximação lenta e contínua (sem cortes); enfeites giram devagar
  tracks.push({ id: "bg", sel: layerSel("bg"), role: "layer", kf: [{ t: 0, s: 1 }, { t: D, s: 1.06, e: "linear" }] });
  tracks.push({ id: "deco", sel: `${layerSel("bg")} [data-ev-deco]`, role: "deco", kf: [{ t: 0, r: -4 }, { t: D, r: 4, e: "linear" }] });

  // abertura: logo, título e faixa
  const iEnd = intro.end;
  const introEnter: Pose = style === "deslizar" ? { x: W * 0.25, o: 0 } : style === "subir" ? { y: H * 0.12, o: 0 } : style === "cortina" ? { c: [0, 100, 0, 0], o: 1 } : { s: 0.86, o: 0 };
  tracks.push({ id: "intro", sel: layerSel("intro"), role: "layer", hide: true, clip: true, kf: [
    { t: 0, ...introEnter }, { t: 0.7, ...STILL, e: "out" },
    { t: r3(iEnd - 0.5), ...STILL }, { t: r3(iEnd), s: 1.08, y: -H * 0.04, o: 0, e: "in" },
  ] });
  tracks.push({ id: "intro-logo", sel: `${layerSel("intro")} [data-ev-logo]`, role: "layer", kf: [{ t: 0.2, s: 0.5, o: 0 }, { t: 0.75, s: 1, o: 1, e: "back" }] });
  tracks.push({ id: "intro-title", sel: `${layerSel("intro")} [data-ev-title]`, role: "layer", kf: [{ t: 0.1, s: 1.18, o: 0 }, { t: 0.75, s: 1, o: 1, e: "out" }] });
  tracks.push({ id: "intro-ribbon", sel: `${layerSel("intro")} [data-ev-ribbon]`, role: "layer", clip: true, kf: [{ t: 0.55, c: [0, 100, 0, 0] }, { t: 1.05, c: [0, 0, 0, 0], e: "inout" }, { t: 1.06, c: null }] });

  // cabeçalho e rodapé fixos durante as ofertas
  const chromeIn = Math.max(0, iEnd - 0.25);
  tracks.push({ id: "header", sel: layerSel("header"), role: "layer", hide: true, kf: [
    { t: chromeIn, y: -H * 0.3, o: 1 }, { t: r3(chromeIn + 0.6), y: 0, e: "out" }, { t: D, y: 0 },
  ] });
  const footerOut = outro.start;
  tracks.push({ id: "footer", sel: layerSel("footer"), role: "layer", hide: true, kf: [
    { t: chromeIn, y: H * 0.3, o: 1 }, { t: r3(chromeIn + 0.6), y: 0, e: "out" },
    { t: r3(footerOut - 0.1), y: 0 }, { t: r3(footerOut + 0.4), y: H * 0.3, e: "in" },
  ] });

  // cenas de produtos
  const productScenes = plan.scenes.filter((s) => s.kind === "products");
  productScenes.forEach((s, idx) => {
    const k = s.itemIds.length;
    const lead = idx === 0 ? 0 : T.OVERLAP; // entra enquanto a anterior sai
    const enterStart = r3(s.start - lead);
    const exitStart = r3(s.end - T.EXIT);
    tracks.push({ id: s.key, sel: layerSel(s.key), role: "layer", hide: true, kf: [{ t: enterStart, o: 1 }, { t: r3(s.end + (idx === productScenes.length - 1 ? 0 : 0.05)), o: 1 }] });
    s.itemIds.forEach((id, j) => {
      const a0 = r3(enterStart + T.STAGGER * j);
      const a1 = r3(a0 + T.ENTER);
      const p0 = r3(a1 + T.PRICE_DELAY);
      const p1 = r3(p0 + T.PRICE_DUR);
      const ex = r3(exitStart + 0.06 * (k - 1 - j));
      const ex1 = r3(Math.min(s.end + 0.05, ex + T.EXIT));
      const still = r3(s.start + pricesStillAt(k));
      tracks.push({ id: `${s.key}-c${j}`, sel: cellSel(s.key, id), role: "cell", clip: true, kf: [
        { t: a0, ...enterPose(style, j, W, H, vertical) },
        { t: a1, ...STILL, e: enterEase(style) },
        { t: Math.max(ex, still), ...STILL },
        { t: Math.max(ex1, still + 0.01), ...exitPose(style, j, W, H, vertical), e: "in" },
      ] });
      // preço: aparece depois do card (o "momento" da oferta) e fica parado até a saída
      tracks.push({ id: `${s.key}-p${j}`, sel: `${cellSel(s.key, id)} [data-ev-price]`, role: "price", kf: [
        { t: p0, s: 0.82, o: 0 }, { t: p1, s: 1, o: 1, e: "out" },
      ] });
      tracks.push({ id: `${s.key}-b${j}`, sel: `${cellSel(s.key, id)} [data-ev-badge]`, role: "price", kf: [
        { t: p0, s: 0.3, r: -25, o: 0 }, { t: r3(p1 + 0.1), s: 1, r: 0, o: 1, e: "back" },
      ] });
    });
  });

  // encerramento: validade, endereço/WhatsApp, "Imagens ilustrativas"
  const oStart = outro.start;
  const outroEnter: Pose = style === "deslizar" ? { x: W, o: 1 } : style === "subir" ? { y: H * 0.4, o: 0 } : style === "cortina" ? { c: [0, 100, 0, 0], o: 1 } : { s: 0.8, o: 0 };
  tracks.push({ id: "outro", sel: layerSel("outro"), role: "layer", hide: true, clip: true, kf: [
    { t: r3(oStart - (productScenes.length ? T.OVERLAP : 0)), ...outroEnter }, { t: r3(oStart + 0.6), ...STILL, e: enterEase(style) }, { t: D, ...STILL },
  ] });
  tracks.push({ id: "outro-rows", sel: `${layerSel("outro")} [data-v-row]`, role: "layer", kf: [{ t: r3(oStart + 0.25), y: 30, o: 0 }, { t: r3(oStart + 0.85), y: 0, o: 1, e: "out" }] });

  return { duration: D, fps: plan.fps, width: W, height: H, tracks };
}

// ------------------------------------------------------------------ verificação (testes e worker)

type Sampler = (kf: Kf[], t: number) => { x: number; y: number; s: number; r: number; o: number; c: number[] | null; active: boolean };
let sampler: Sampler | null = null;
/** Mesma interpolação do runtime do navegador (código único: RUNTIME_CORE). */
export function sampleTrack(kf: Kf[], t: number) {
  sampler ??= new Function(`${RUNTIME_CORE}; return evSample;`)() as Sampler;
  return sampler(kf, t);
}

const isStill = (v: ReturnType<Sampler>) => Math.abs(v.x) < 0.01 && Math.abs(v.y) < 0.01 && Math.abs(v.s - 1) < 1e-4 && Math.abs(v.r) < 0.01 && v.o >= 0.999 && (!v.c || v.c.every((n) => Math.abs(n) < 0.01));

/** Para cada preço: maior intervalo contínuo (s) em que card e preço estão parados e visíveis. */
export function priceHoldSeconds(tl: Timeline, step = 1 / 60): Array<{ id: string; seconds: number }> {
  const out: Array<{ id: string; seconds: number }> = [];
  for (const p of tl.tracks.filter((x) => x.role === "price" && x.id.includes("-p"))) {
    const cell = tl.tracks.find((x) => x.id === p.id.replace("-p", "-c"))!;
    const layer = tl.tracks.find((x) => x.id === p.id.split("-p")[0])!;
    let best = 0, run = 0;
    for (let t = 0; t <= tl.duration; t += step) {
      const ok = isStill(sampleTrack(p.kf, t)) && isStill(sampleTrack(cell.kf, t)) && sampleTrack(layer.kf, t).active;
      run = ok ? run + step : 0;
      best = Math.max(best, run);
    }
    out.push({ id: p.id, seconds: Math.round(best * 100) / 100 });
  }
  return out;
}
