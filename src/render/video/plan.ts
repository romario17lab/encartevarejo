// Planejamento do vídeo (função PURA e determinística): escolhe os produtos de cada cena, a duração
// de cada parte e o que ficou de fora. Usado na prévia, na criação do pedido e no worker — o mesmo
// resultado nos três lugares para os mesmos dados.
//
// Regras:
//  - destaques primeiro (cada destaque ganha uma cena só para ele), depois os demais na ordem da campanha;
//  - itens pausados (acabou o estoque) não entram no vídeo;
//  - cada preço fica PARADO e totalmente legível por pelo menos MIN_HOLD segundos;
//  - duração escolhida (15/30/45/60 s) ou automática pela quantidade de itens; nunca acima de 60 s;
//  - o que não couber no tempo é informado pelo nome.
import type { RenderItem } from "@/domain/campaign";
import { ORIENTATIONS, VIDEO_MAX_SECONDS, type DurationChoice, type VideoOrientation, type VideoStyle } from "./options";

/** Tempos da coreografia (segundos). */
export const T = {
  ENTER: 0.6,
  STAGGER: 0.18,
  PRICE_DELAY: 0.1,
  PRICE_DUR: 0.35,
  /** preço parado e legível, no mínimo (acima de 1,5 s com folga) */
  MIN_HOLD: 1.6,
  EXIT: 0.45,
  /** a cena seguinte começa a entrar enquanto a anterior sai (nunca durante a leitura do preço) */
  OVERLAP: 0.2,
  INTRO: { min: 2.2, ideal: 2.6, max: 4 },
  OUTRO: { min: 3.0, ideal: 3.6, max: 6 },
  AUTO_MIN: 10,
} as const;

/** Momento em que todos os preços da cena já estão parados (relativo ao início da cena). */
export const pricesStillAt = (k: number) => T.ENTER + T.STAGGER * (k - 1) + T.PRICE_DELAY + T.PRICE_DUR;
export const sceneMin = (k: number) => pricesStillAt(k) + T.MIN_HOLD + T.EXIT;
export const sceneIdeal = (k: number) => sceneMin(k) + 0.8 + 0.5 * (k - 1);
export const sceneMax = (k: number) => sceneIdeal(k) + 2.5;

export interface PlannedScene {
  key: string; // "intro" | "s0".. | "outro"
  kind: "intro" | "products" | "outro";
  start: number;
  end: number;
  itemIds: string[];
  /** cena repetida (sobra de tempo com poucos produtos) */
  repeat?: boolean;
}

export interface VideoPlan {
  orientation: VideoOrientation;
  style: VideoStyle;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  durationChoice: DurationChoice;
  scenes: PlannedScene[];
  /** itens mostrados (sem repetição), na ordem em que aparecem */
  shownItemIds: string[];
  omitted: Array<{ id: string; name: string }>;
  warnings: string[];
}

export interface PlanInput {
  items: Array<Pick<RenderItem, "id" | "name" | "highlight">>;
  pausedItemIds?: string[];
  orientation: VideoOrientation;
  style: VideoStyle;
  duration: DurationChoice;
  fps?: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Produtos por cena (sem contar destaques, que ficam sozinhos). */
export const baseCapacity = (o: VideoOrientation) => (o === "vertical" ? 2 : 3);

function groupItems<T extends { id: string; highlight: boolean }>(items: T[], cap: number): T[][] {
  const hi = items.filter((i) => i.highlight);
  const rest = items.filter((i) => !i.highlight);
  const groups: T[][] = hi.map((i) => [i]);
  for (let i = 0; i < rest.length; i += cap) groups.push(rest.slice(i, i + cap));
  return groups;
}

/** Distribui `extra` segundos subindo cada parte de `from` para `to` (proporcional à folga). */
function raise(d: number[], to: number[], extra: number): number {
  const room = d.map((v, i) => Math.max(0, to[i] - v));
  const total = room.reduce((a, b) => a + b, 0);
  if (total <= 0 || extra <= 0) return extra;
  const k = Math.min(1, extra / total);
  for (let i = 0; i < d.length; i++) d[i] += room[i] * k;
  return extra - total * k;
}

export function nameList(names: string[], max = 4): string {
  if (!names.length) return "";
  const shown = names.slice(0, max).map((n) => `“${n}”`);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} e mais ${more}`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} e ${shown[shown.length - 1]}`;
}

export function planVideo(input: PlanInput): VideoPlan {
  const { orientation, style } = input;
  const fps = input.fps ?? 30;
  const o = ORIENTATIONS[orientation];
  const paused = new Set(input.pausedItemIds ?? []);
  const items = input.items.filter((i) => !paused.has(i.id));
  const warnings: string[] = [];
  if (paused.size && input.items.some((i) => paused.has(i.id))) warnings.push("Itens marcados como “acabou” não entram no vídeo.");

  // ordem: destaques primeiro, depois a ordem da campanha
  const ordered = [...items.filter((i) => i.highlight), ...items.filter((i) => !i.highlight)];

  type Choice = { groups: typeof ordered[]; D: number; used: number };
  const tryCap = (cap: number): Choice => {
    const groups = groupItems(ordered, cap);
    if (input.duration === "auto") {
      let used = groups.length;
      const total = () => T.INTRO.ideal + T.OUTRO.ideal + groups.slice(0, used).reduce((a, g) => a + sceneIdeal(g.length), 0);
      while (used > 0 && total() > VIDEO_MAX_SECONDS) used--;
      // se nem com o ideal couber tudo, cabe mais com o mínimo
      if (used < groups.length) {
        used = 0;
        let sum = T.INTRO.min + T.OUTRO.min;
        while (used < groups.length && sum + sceneMin(groups[used].length) <= VIDEO_MAX_SECONDS) { sum += sceneMin(groups[used].length); used++; }
        return { groups, D: VIDEO_MAX_SECONDS, used };
      }
      return { groups, D: Math.min(VIDEO_MAX_SECONDS, Math.max(T.AUTO_MIN, Math.ceil(total()))), used };
    }
    const D = Math.min(VIDEO_MAX_SECONDS, input.duration);
    let used = 0;
    let sum = T.INTRO.min + T.OUTRO.min;
    while (used < groups.length && sum + sceneMin(groups[used].length) <= D) { sum += sceneMin(groups[used].length); used++; }
    return { groups, D, used };
  };

  const cap = baseCapacity(orientation);
  let choice = tryCap(cap);
  const omittedCount = (c: Choice) => c.groups.slice(c.used).reduce((a, g) => a + g.length, 0);
  // no vertical cabe um card a mais por cena sem perder a leitura; no horizontal 3 já é o limite
  if (omittedCount(choice) > 0 && orientation === "vertical") {
    const denser = tryCap(cap + 1);
    if (omittedCount(denser) < omittedCount(choice)) choice = denser;
  }
  const { D } = choice;
  let groups = choice.groups.slice(0, choice.used);
  const omittedGroups = choice.groups.slice(choice.used);
  const omitted = omittedGroups.flat().map((i) => ({ id: i.id, name: i.name }));

  // repete as cenas quando sobra muito tempo (poucos produtos e duração longa)
  const repeatFrom = groups.length;
  if (groups.length) {
    const maxSum = () => T.INTRO.max + T.OUTRO.max + groups.reduce((a, g) => a + sceneMax(g.length), 0);
    let i = 0;
    while (maxSum() < D && groups.length < 60) {
      const g = groups[i % repeatFrom];
      const minSum = T.INTRO.min + T.OUTRO.min + groups.reduce((a, x) => a + sceneMin(x.length), 0) + sceneMin(g.length);
      if (minSum > D) break;
      groups = [...groups, g];
      i++;
    }
  }

  // durações: começa no mínimo e sobe até o ideal, depois até o máximo; o resto vai para o encerramento
  const mins = [T.INTRO.min, ...groups.map((g) => sceneMin(g.length)), T.OUTRO.min];
  const ideals = [T.INTRO.ideal, ...groups.map((g) => sceneIdeal(g.length)), T.OUTRO.ideal];
  const maxs = [T.INTRO.max, ...groups.map((g) => sceneMax(g.length)), T.OUTRO.max];
  const d = [...mins];
  let extra = D - mins.reduce((a, b) => a + b, 0);
  extra = raise(d, ideals, extra);
  extra = raise(d, maxs, extra);
  if (extra > 0) d[d.length - 1] += extra;

  const scenes: PlannedScene[] = [];
  let t = 0;
  const push = (s: Omit<PlannedScene, "start" | "end">, dur: number) => {
    scenes.push({ ...s, start: round3(t), end: round3(t + dur) });
    t += dur;
  };
  push({ key: "intro", kind: "intro", itemIds: [] }, d[0]);
  groups.forEach((g, i) => push({ key: `s${i}`, kind: "products", itemIds: g.map((x) => x.id), ...(i >= repeatFrom ? { repeat: true } : {}) }, d[i + 1]));
  push({ key: "outro", kind: "outro", itemIds: [] }, d[d.length - 1]);
  scenes[scenes.length - 1].end = D; // fecha exatamente na duração

  if (!items.length) warnings.push("A campanha não tem produtos para mostrar no vídeo.");
  if (omitted.length)
    warnings.push(`Ficaram de fora por falta de tempo: ${nameList(omitted.map((x) => x.name))}. Aumente a duração ou marque os produtos mais importantes como destaque.`);
  if (groups.length > repeatFrom) warnings.push("Poucos produtos para esta duração: as ofertas aparecem mais de uma vez. Uma duração menor deixa o vídeo mais dinâmico.");

  return {
    orientation, style, width: o.width, height: o.height, fps, durationSec: D, durationChoice: input.duration,
    scenes, shownItemIds: groups.slice(0, repeatFrom).flat().map((i) => i.id), omitted, warnings,
  };
}
