// Motor de layout das peças (Agente de Geração).
// Função PURA e determinística: sem DOM, sem relógio, sem aleatoriedade.
// Entrada: campanha + modelo + formato + personalização da peça. Saída: páginas com retângulos
// inteiros (px no tamanho nativo do formato), sem sobreposição e sempre dentro da página.
//
// Observação sobre itens "pausados" (acabou o estoque): o pausado some SOMENTE da vitrine.
// RenderCampaign não carrega o campo `paused`, e peças impressas/exportadas continuam mostrando
// o item (o material impresso já pode estar circulando). A vitrine filtra pausados por conta própria.

import { mmToPx, type FormatSpec } from "@/domain/formats";
import type { PieceOverrides, RenderItem } from "@/domain/campaign";
import { validateOffer } from "@/domain/offer";
import type {
  CellSize, LayoutCell, LayoutFn, LayoutResult, LayoutSection, LayoutWarning, PageLayout, Rect,
  TemplateDefinition, TemplateLayoutRules,
} from "@/templates/contract";

// ---------------------------------------------------------------------------------------------
// Utilidades

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Regras do modelo para o formato (com valores seguros se o modelo omitir algo). */
export function rulesFor(template: TemplateDefinition, format: FormatSpec): TemplateLayoutRules {
  const r = template.layout[format.id] ?? template.layout.default;
  return {
    headerRatio: {
      first: clamp(r.headerRatio?.first ?? 0.18, 0, 0.6),
      continuation: clamp(r.headerRatio?.continuation ?? 0.1, 0, 0.6),
    },
    footerRatio: clamp(r.footerRatio ?? 0.08, 0, 0.4),
    gap: Math.max(0, Math.round(r.gap ?? 12)),
    padding: Math.max(0, Math.round(r.padding ?? 0)),
    preferredItemsPerPage: Math.max(1, Math.round(r.preferredItemsPerPage ?? format.maxItemsPerPage)),
    maxHeroPerPage: Math.max(0, Math.round(r.maxHeroPerPage ?? 1)),
    cardAspect: {
      min: r.cardAspect?.min ?? 0.5,
      max: Math.max(r.cardAspect?.max ?? 2, r.cardAspect?.min ?? 0.5),
    },
  };
}

/** Quantos produtos por página/tela este formato vai usar (e se o usuário pediu acima do máximo). */
export function resolveItemsPerPage(format: FormatSpec, rules: TemplateLayoutRules, overrides: PieceOverrides): { perPage: number; forcedAbove: number | null } {
  if (format.kind === "single") return { perPage: 1, forcedAbove: null };
  if (format.kind === "tags") return { perPage: format.maxItemsPerPage, forcedAbove: null };
  const forced = overrides.itemsPerPage;
  if (typeof forced === "number") {
    if (forced > format.maxItemsPerPage) return { perPage: format.maxItemsPerPage, forcedAbove: forced };
    return { perPage: clamp(Math.round(forced), format.minItemsPerPage, format.maxItemsPerPage), forcedAbove: null };
  }
  return { perPage: clamp(rules.preferredItemsPerPage, format.minItemsPerPage, format.maxItemsPerPage), forcedAbove: null };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const unitWord = (format: FormatSpec) => (format.physical ? ["página", "páginas"] : ["tela", "telas"]) as [string, string];

// ---------------------------------------------------------------------------------------------
// Ordenação, agrupamento e paginação

interface Group { title: string | null; items: RenderItem[] }
interface PagePlan { groups: Group[] }

const NO_CATEGORY = "Outros";

/** Agrupa por categoria mantendo a ordem da primeira aparição (posição); itens sem categoria vão ao fim. */
export function groupByCategory(items: RenderItem[]): Group[] {
  const map = new Map<string, RenderItem[]>();
  let none: RenderItem[] = [];
  for (const it of items) {
    const c = it.category?.trim();
    if (!c) { none.push(it); continue; }
    const key = c.toLocaleLowerCase("pt-BR");
    const list = map.get(key);
    if (list) list.push(it); else map.set(key, [it]);
  }
  const groups: Group[] = [...map.values()].map((list) => ({ title: list[0].category!.trim(), items: list }));
  if (none.length) groups.push({ title: NO_CATEGORY, items: none });
  none = [];
  return groups;
}

/** Distribui N itens em páginas de no máximo `perPage`, equilibrando (sem um item sozinho na última página). */
function paginateBalanced(items: RenderItem[], perPage: number): RenderItem[][] {
  if (items.length === 0) return [[]];
  const pages = Math.ceil(items.length / perPage);
  const base = Math.floor(items.length / pages);
  const extra = items.length % pages;
  const out: RenderItem[][] = [];
  let i = 0;
  for (let p = 0; p < pages; p++) {
    const n = base + (p < extra ? 1 : 0);
    out.push(items.slice(i, i + n));
    i += n;
  }
  return out;
}

/** Paginação por categoria: mantém a categoria junta quando cabe; senão continua com "(cont.)". */
function paginateByCategory(groups: Group[], perPage: number): PagePlan[] {
  const pages: PagePlan[] = [];
  let cur: Group[] = [];
  let count = 0;
  const flush = () => { if (cur.length) pages.push({ groups: cur }); cur = []; count = 0; };
  for (const g of groups) {
    let rest = g.items;
    let cont = false;
    // categoria inteira não cabe no que sobrou, mas cabe numa página nova e a atual já está bem cheia
    if (count > 0 && rest.length > perPage - count && rest.length <= perPage && count >= perPage / 2) flush();
    while (rest.length) {
      const room = perPage - count;
      if (room <= 0) { flush(); continue; }
      const take = rest.slice(0, room);
      cur.push({ title: cont ? `${g.title} (cont.)` : g.title, items: take });
      count += take.length;
      rest = rest.slice(take.length);
      if (rest.length) { cont = true; flush(); }
    }
  }
  flush();
  if (!pages.length) pages.push({ groups: [] });
  // última página com um item sozinho: puxa um item da página anterior quando for da mesma categoria
  if (pages.length >= 2) {
    const last = pages[pages.length - 1];
    const prev = pages[pages.length - 2];
    const lastCount = last.groups.reduce((s, g) => s + g.items.length, 0);
    const prevLast = prev.groups[prev.groups.length - 1];
    const prevCount = prev.groups.reduce((s, g) => s + g.items.length, 0);
    if (lastCount === 1 && prevCount >= 3 && prevLast && prevLast.items.length >= 2 && last.groups[0]?.title?.startsWith(stripCont(prevLast.title))) {
      const moved = prevLast.items[prevLast.items.length - 1];
      prevLast.items = prevLast.items.slice(0, -1);
      last.groups[0].items = [moved, ...last.groups[0].items];
    }
  }
  return pages;
}
const stripCont = (t: string | null) => (t ?? "").replace(/ \(cont\.\)$/, "");

// ---------------------------------------------------------------------------------------------
// Grade de uma página

type Shape = { w: number; h: number; size: CellSize };
interface Placement { item: RenderItem; col: number; row: number; shape: Shape }
interface GroupPlacement { title: string | null; rows: number; placements: Placement[] }
interface GridCandidate { cols: number; groups: GroupPlacement[]; totalRows: number; score: number; heroes: number }

/** Empacotamento denso: destaques primeiro (2×2 ou 2×1), depois os demais em ordem. */
function packGroup(items: RenderItem[], heroIds: Set<string>, cols: number, heroShape: Shape | null): { rows: number; placements: Placement[] } {
  const ordered = [...items.filter((i) => heroIds.has(i.id)), ...items.filter((i) => !heroIds.has(i.id))];
  const occ: boolean[][] = [];
  const isFree = (r: number, c: number) => !(occ[r]?.[c]);
  const mark = (r: number, c: number) => { (occ[r] ??= [])[c] = true; };
  const placements: Placement[] = [];
  for (const item of ordered) {
    const shape: Shape = heroIds.has(item.id) && heroShape ? heroShape : { w: 1, h: 1, size: "normal" };
    let placed = false;
    for (let r = 0; !placed && r < 10_000; r++) {
      for (let c = 0; c + shape.w <= cols; c++) {
        let ok = true;
        for (let dr = 0; ok && dr < shape.h; dr++) for (let dc = 0; ok && dc < shape.w; dc++) if (!isFree(r + dr, c + dc)) ok = false;
        if (ok) {
          for (let dr = 0; dr < shape.h; dr++) for (let dc = 0; dc < shape.w; dc++) mark(r + dr, c + dc);
          placements.push({ item, col: c, row: r, shape });
          placed = true;
          break;
        }
      }
    }
  }
  const rows = placements.reduce((m, p) => Math.max(m, p.row + p.shape.h), 0);
  return { rows, placements };
}

interface Geometry { gridX: number; gridY: number; gridW: number; gridH: number; cellW: number; cellH: number; sectionH: number }

function geometry(body: Rect, rules: TemplateLayoutRules, cols: number, totalRows: number, titled: number, groupCount: number, sectionH: number, capAspect: boolean): Geometry | null {
  const innerX = body.x + rules.padding;
  const innerY = body.y + rules.padding;
  const innerW = body.w - 2 * rules.padding;
  const innerH = body.h - 2 * rules.padding;
  if (innerW <= 0 || innerH <= 0 || cols <= 0) return null;
  const rowGaps = Math.max(0, totalRows - groupCount) * rules.gap; // gaps entre linhas dentro dos grupos
  const groupGaps = Math.max(0, groupCount - 1) * rules.gap; // gap entre grupos
  const sectionTotal = titled * (sectionH + Math.round(rules.gap / 2));
  let cellW = (innerW - (cols - 1) * rules.gap) / cols;
  let cellH = totalRows > 0 ? (innerH - rowGaps - groupGaps - sectionTotal) / totalRows : innerH;
  if (cellW < 1 || cellH < 1) return null;
  if (capAspect && totalRows > 0) {
    const a = cellW / cellH;
    if (a > rules.cardAspect.max) cellW = cellH * rules.cardAspect.max;
    else if (a < rules.cardAspect.min) cellH = cellW / rules.cardAspect.min;
  }
  const gridW = cols * cellW + (cols - 1) * rules.gap;
  const gridH = totalRows * cellH + rowGaps + groupGaps + sectionTotal;
  return {
    gridX: innerX + (innerW - gridW) / 2,
    gridY: innerY + (innerH - gridH) / 2,
    gridW, gridH, cellW, cellH, sectionH,
  };
}

function scoreCandidate(c: GridCandidate, body: Rect, rules: TemplateLayoutRules, sectionH: number, wantedHeroes: number): number {
  const titled = c.groups.filter((g) => g.title !== null).length;
  const g = geometry(body, rules, c.cols, c.totalRows, titled, c.groups.length, sectionH, false);
  if (!g) return -Infinity;
  const a = g.cellW / g.cellH;
  const { min, max } = rules.cardAspect;
  const target = Math.sqrt(min * max);
  // penalidade de proporção fora da faixa aceitável (forte) e distância do centro (fraca)
  let aspectPenalty = 0;
  if (a < min) aspectPenalty = Math.log(min / a) * 8;
  else if (a > max) aspectPenalty = Math.log(a / max) * 8;
  aspectPenalty += Math.abs(Math.log(a / target)) * 0.6;
  // espaços vazios na grade
  const slots = c.groups.reduce((s, gp) => s + gp.rows * c.cols, 0);
  const used = c.groups.reduce((s, gp) => s + gp.placements.reduce((t, p) => t + p.shape.w * p.shape.h, 0), 0);
  const emptyPenalty = slots > 0 ? (1 - used / slots) * 2.5 : 0;
  // cards muito pequenos ficam ilegíveis
  const minSide = Math.min(g.cellW, g.cellH);
  if (minSide < 40) return -Infinity;
  const smallPenalty = minSide < 90 ? (90 - minSide) / 20 : 0;
  const heroPenalty = (wantedHeroes - c.heroes) * 0.35;
  return -(aspectPenalty + emptyPenalty + smallPenalty + heroPenalty) + Math.log(g.cellW * g.cellH) * 0.15;
}

function chooseGrid(groups: Group[], body: Rect, rules: TemplateLayoutRules, sectionH: number): GridCandidate | null {
  const all = groups.flatMap((g) => g.items);
  if (!all.length) return null;
  const highlighted = all.filter((i) => i.highlight).slice(0, rules.maxHeroPerPage);
  const n = all.length;
  const maxCols = Math.min(6, Math.max(1, n));
  let best: GridCandidate | null = null;
  for (let cols = 1; cols <= maxCols; cols++) {
    const heroOptions: Array<{ shape: Shape | null; count: number }> = [{ shape: null, count: 0 }];
    if (highlighted.length) {
      for (let k = highlighted.length; k >= 1; k--) {
        if (cols >= 2) {
          heroOptions.push({ shape: { w: 2, h: 2, size: "hero" }, count: k });
          heroOptions.push({ shape: { w: 2, h: 1, size: "large" }, count: k });
        } else {
          heroOptions.push({ shape: { w: 1, h: 2, size: "hero" }, count: k });
        }
      }
    }
    for (const opt of heroOptions) {
      const heroIds = new Set(highlighted.slice(0, opt.count).map((i) => i.id));
      const placed = groups.map((g) => ({ title: g.title, ...packGroup(g.items, heroIds, cols, opt.shape) }));
      const totalRows = placed.reduce((s, g) => s + g.rows, 0);
      const cand: GridCandidate = { cols, groups: placed, totalRows, score: 0, heroes: opt.count };
      cand.score = scoreCandidate(cand, body, rules, sectionH, highlighted.length);
      if (!best || cand.score > best.score + 1e-9) best = cand;
    }
  }
  return best;
}

/** Converte a grade escolhida em retângulos inteiros. Bordas arredondadas a partir de coordenadas
 *  absolutas (nunca somando larguras arredondadas), então células vizinhas nunca se sobrepõem. */
function materialize(cand: GridCandidate, body: Rect, rules: TemplateLayoutRules, sectionH: number, pageArea: number, startIndex: Map<string, number>): { cells: LayoutCell[]; sections: LayoutSection[] } {
  const titled = cand.groups.filter((g) => g.title !== null).length;
  const g = geometry(body, rules, cand.cols, cand.totalRows, titled, cand.groups.length, sectionH, true)!;
  const colX = (c: number) => g.gridX + c * (g.cellW + rules.gap);
  const cells: LayoutCell[] = [];
  const sections: LayoutSection[] = [];
  let y = g.gridY;
  const compact = g.cellW * g.cellH < pageArea / 30;
  cand.groups.forEach((grp, gi) => {
    if (gi > 0) y += rules.gap;
    if (grp.title !== null) {
      const top = Math.round(y);
      sections.push({ title: grp.title, rect: { x: Math.round(g.gridX), y: top, w: Math.round(g.gridX + g.gridW) - Math.round(g.gridX), h: Math.round(y + g.sectionH) - top } });
      y += g.sectionH + Math.round(rules.gap / 2);
    }
    const rowY = (r: number) => y + r * (g.cellH + rules.gap);
    // última linha incompleta (só cards 1×1, ninguém mais nela): centraliza em vez de deixar buraco à direita
    const lastRow = grp.rows - 1;
    const inLast = grp.placements.filter((p) => p.row <= lastRow && p.row + p.shape.h - 1 >= lastRow);
    const usedCols = inLast.reduce((s, p) => s + p.shape.w, 0);
    const centerShift = inLast.length && usedCols < cand.cols && inLast.every((p) => p.row === lastRow && p.shape.h === 1)
      ? ((cand.cols - usedCols) * (g.cellW + rules.gap)) / 2 : 0;
    for (const p of grp.placements) {
      const dx = p.row === lastRow && centerShift ? centerShift : 0;
      const x0 = Math.round(colX(p.col) + dx);
      const x1 = Math.round(colX(p.col + p.shape.w - 1) + g.cellW + dx);
      const y0 = Math.round(rowY(p.row));
      const y1 = Math.round(rowY(p.row + p.shape.h - 1) + g.cellH);
      const size: CellSize = p.shape.size === "normal" && compact ? "compact" : p.shape.size;
      cells.push({ item: p.item, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, size, index: startIndex.get(p.item.id) ?? 0 });
    }
    y += grp.rows * g.cellH + Math.max(0, grp.rows - 1) * rules.gap;
  });
  // ordem de leitura: de cima para baixo, da esquerda para a direita
  cells.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return { cells, sections };
}

/** Divide uma página inviável em duas, preservando grupos (o grupo partido ganha "(cont.)"). */
function splitPlan(plan: PagePlan): [PagePlan, PagePlan] {
  const count = plan.groups.reduce((s, g) => s + g.items.length, 0);
  let left = Math.ceil(count / 2);
  const a: Group[] = [], b: Group[] = [];
  for (const g of plan.groups) {
    if (left <= 0) { b.push(g); continue; }
    if (g.items.length <= left) { a.push(g); left -= g.items.length; continue; }
    a.push({ title: g.title, items: g.items.slice(0, left) });
    b.push({ title: g.title === null ? null : `${stripCont(g.title)} (cont.)`, items: g.items.slice(left) });
    left = 0;
  }
  return [{ groups: a }, { groups: b }];
}

/** Último recurso (não deveria ocorrer): um item por linha, ocupando o corpo. */
function fallbackStack(plan: PagePlan, body: Rect, indexOf: Map<string, number>): { cells: LayoutCell[]; sections: LayoutSection[] } {
  const items = plan.groups.flatMap((g) => g.items);
  const h = body.h / Math.max(1, items.length);
  return {
    sections: [],
    cells: items.map((item, i) => {
      const y0 = Math.round(body.y + i * h), y1 = Math.round(body.y + (i + 1) * h);
      return { item, rect: { x: body.x, y: y0, w: body.w, h: Math.max(1, y1 - y0) }, size: "compact" as const, index: indexOf.get(item.id) ?? 0 };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Cabeçalho/corpo/rodapé

function frame(format: FormatSpec, rules: TemplateLayoutRules, variant: PageLayout["variant"]): { header: Rect; body: Rect; footer: Rect } {
  const W = format.widthPx, H = format.heightPx, safe = format.safeAreaPx;
  const ratio = variant === "continuation" ? rules.headerRatio.continuation : rules.headerRatio.first;
  const headerH = Math.round(H * ratio);
  const footerH = Math.round(H * rules.footerRatio);
  const top = Math.max(headerH, safe);
  const bottom = Math.min(H - footerH, H - safe);
  const body: Rect = { x: safe, y: top, w: Math.max(0, W - 2 * safe), h: Math.max(0, bottom - top) };
  return { header: { x: 0, y: 0, w: W, h: headerH }, body, footer: { x: 0, y: H - footerH, w: W, h: footerH } };
}

// ---------------------------------------------------------------------------------------------
// Etiquetas: folha A4 com 8 etiquetas de 95×65 mm (2×4), centralizadas, com vão para marcas de corte

export const TAG_SHEET = { cols: 2, rows: 4, tagWmm: 95, tagHmm: 65, gutterMm: 4 } as const;

function tagsPages(format: FormatSpec, items: RenderItem[], indexOf: Map<string, number>): PageLayout[] {
  const { cols, rows, tagWmm, tagHmm, gutterMm } = TAG_SHEET;
  const perSheet = cols * rows;
  const pwMm = format.physical?.widthMm ?? (format.widthPx * 25.4) / 96;
  const phMm = format.physical?.heightMm ?? (format.heightPx * 25.4) / 96;
  const gridWmm = cols * tagWmm + (cols - 1) * gutterMm;
  const gridHmm = rows * tagHmm + (rows - 1) * gutterMm;
  const leftMm = (pwMm - gridWmm) / 2;
  const topMm = (phMm - gridHmm) / 2;
  const px = (vMm: number) => clamp(mmToPx(vMm), 0, Math.max(format.widthPx, format.heightPx));
  const sheets = Math.max(1, Math.ceil(items.length / perSheet));
  const pages: PageLayout[] = [];
  const top = px(topMm), bottom = Math.min(format.heightPx, px(topMm + gridHmm));
  const left = px(leftMm), right = Math.min(format.widthPx, px(leftMm + gridWmm));
  for (let s = 0; s < sheets; s++) {
    const slice = items.slice(s * perSheet, (s + 1) * perSheet);
    const cells: LayoutCell[] = slice.map((item, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x0 = px(leftMm + c * (tagWmm + gutterMm)), x1 = Math.min(format.widthPx, px(leftMm + c * (tagWmm + gutterMm) + tagWmm));
      const y0 = px(topMm + r * (tagHmm + gutterMm)), y1 = Math.min(format.heightPx, px(topMm + r * (tagHmm + gutterMm) + tagHmm));
      return { item, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, size: "normal", index: indexOf.get(item.id) ?? 0 };
    });
    pages.push({
      pageIndex: s, totalPages: sheets,
      header: { x: 0, y: 0, w: format.widthPx, h: top },
      body: { x: left, y: top, w: right - left, h: bottom - top },
      footer: { x: 0, y: bottom, w: format.widthPx, h: format.heightPx - bottom },
      cells, sections: [], variant: sheets === 1 ? "single" : s === 0 ? "first" : "continuation",
    });
  }
  return pages;
}

// ---------------------------------------------------------------------------------------------
// Avisos

const LONG_NAME = 60;
const q = (s: string) => `“${s.length > 40 ? s.slice(0, 38) + "…" : s}”`;

function itemWarnings(pages: PageLayout[]): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  for (const page of pages) {
    for (const cell of page.cells) {
      const it = cell.item;
      if (!it.imageUrl) out.push({ code: "missing_image", itemId: it.id, pageIndex: page.pageIndex, message: `${q(it.name)} está sem foto. O card mostra só o nome e o preço.` });
      for (const issue of validateOffer(it.offer, { unit: it.unit })) {
        if (issue.level === "error") out.push({ code: "invalid_price", itemId: it.id, pageIndex: page.pageIndex, message: `${q(it.name)}: ${issue.message}` });
      }
      const narrow = cell.size === "compact" || cell.rect.w < 220;
      if (it.name.length > LONG_NAME && narrow)
        out.push({ code: "long_name_truncated", itemId: it.id, pageIndex: page.pageIndex, message: `O nome de ${q(it.name)} é longo e pode ser abreviado nesta peça. Considere um nome mais curto.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Função principal

export const layoutPiece: LayoutFn = ({ campaign, format: formatIn, template, overrides }) => {
  const format = formatIn;
  const rules = rulesFor(template, format);
  const warnings: LayoutWarning[] = [];
  const hidden = new Set(overrides.hiddenItemIds ?? []);
  const visible = campaign.items.filter((i) => !hidden.has(i.id));
  const hiddenCount = campaign.items.length - visible.length;
  if (hiddenCount > 0)
    warnings.push({ code: "item_hidden", message: `${plural(hiddenCount, "produto está oculto", "produtos estão ocultos")} nesta peça.` });

  const order = overrides.order ?? "manual";
  const byCategory = order === "category";
  const ordered = byCategory ? groupByCategory(visible).flatMap((g) => g.items) : visible;
  const indexOf = new Map(ordered.map((it, i) => [it.id, i] as const));

  const { perPage, forcedAbove } = resolveItemsPerPage(format, rules, overrides);
  const [one, many] = unitWord(format);
  if (forcedAbove !== null) {
    const pagesNeeded = Math.max(1, Math.ceil(visible.length / perPage));
    warnings.push({ code: "too_many_items", message: `${format.label} comporta no máximo ${plural(perPage, "produto", "produtos")} por ${one} para continuar legível. Você pediu ${forcedAbove}; usamos ${perPage} e dividimos em ${plural(pagesNeeded, one, many)}.` });
  }

  let pages: PageLayout[];
  if (format.kind === "tags") {
    pages = tagsPages(format, ordered, indexOf);
  } else if (format.kind === "single") {
    const list = ordered.length ? ordered : [];
    const total = Math.max(1, list.length);
    pages = [];
    for (let p = 0; p < total; p++) {
      const f = frame(format, rules, "single");
      const item = list[p];
      const pad = rules.padding;
      const cells: LayoutCell[] = item ? [{ item, rect: { x: f.body.x + pad, y: f.body.y + pad, w: Math.max(1, f.body.w - 2 * pad), h: Math.max(1, f.body.h - 2 * pad) }, size: "hero", index: p }] : [];
      pages.push({ pageIndex: p, totalPages: total, ...f, cells, sections: [], variant: "single" });
    }
  } else {
    const showHeaders = byCategory && overrides.showCategoryHeaders !== false;
    const plans: PagePlan[] = byCategory
      ? paginateByCategory(groupByCategory(visible), perPage)
      : paginateBalanced(visible, perPage).map((items) => ({ groups: [{ title: null, items }] }));
    const sectionH = Math.max(24, Math.round(Math.min(format.widthPx, format.heightPx) * 0.045));
    const pageArea = format.widthPx * format.heightPx;
    const effectiveGroups = (plan: PagePlan): Group[] => {
      const groups = plan.groups.map((g) => ({ title: showHeaders ? g.title : null, items: g.items }));
      // sem cabeçalhos: junta os grupos para empacotar numa grade única
      return showHeaders ? groups : [{ title: null, items: groups.flatMap((g) => g.items) }];
    };
    // Garante que cada página cabe (cards legíveis); se não couber, divide a página em duas.
    // O cabeçalho da 1ª página é o mais alto, então testar com "first" é o caso mais restritivo.
    const worstBody = frame(format, rules, "first").body;
    const feasible: PagePlan[] = [];
    const queue = [...plans];
    while (queue.length) {
      const plan = queue.shift()!;
      const count = plan.groups.reduce((s, g) => s + g.items.length, 0);
      const cand = chooseGrid(effectiveGroups(plan), worstBody, rules, sectionH);
      if (count <= 1 || (cand && Number.isFinite(cand.score))) { feasible.push(plan); continue; }
      const [a, b] = splitPlan(plan);
      queue.unshift(a, b);
    }
    const total = feasible.length;
    pages = feasible.map((plan, p) => {
      const variant: PageLayout["variant"] = total === 1 ? "single" : p === 0 ? "first" : "continuation";
      const f = frame(format, rules, variant);
      const cand = chooseGrid(effectiveGroups(plan), f.body, rules, sectionH);
      const { cells, sections } = cand && Number.isFinite(cand.score)
        ? materialize(cand, f.body, rules, sectionH, pageArea, indexOf)
        : fallbackStack(plan, f.body, indexOf);
      return { pageIndex: p, totalPages: total, ...f, cells, sections, variant };
    });
  }

  warnings.push(...itemWarnings(pages));
  const result: LayoutResult = { format, pages, warnings };
  return result;
};

// ---------------------------------------------------------------------------------------------
// Verificações geométricas (usadas em testes e como guarda antes de exportar)

export const rectsOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const rectInside = (r: Rect, outer: Rect) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;

/** Retorna problemas geométricos (lista vazia = layout válido). */
export function checkLayout(result: LayoutResult): string[] {
  const problems: string[] = [];
  const page: Rect = { x: 0, y: 0, w: result.format.widthPx, h: result.format.heightPx };
  for (const p of result.pages) {
    const rects = [...p.cells.map((c) => ({ r: c.rect, id: `cell ${c.item.id}` })), ...p.sections.map((s) => ({ r: s.rect, id: `section ${s.title}` }))];
    for (const { r, id } of rects) {
      if (![r.x, r.y, r.w, r.h].every(Number.isInteger)) problems.push(`p${p.pageIndex}: ${id} não inteiro`);
      if (r.w <= 0 || r.h <= 0) problems.push(`p${p.pageIndex}: ${id} vazio`);
      if (!rectInside(r, page)) problems.push(`p${p.pageIndex}: ${id} fora da página`);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        if (rectsOverlap(rects[i].r, rects[j].r)) problems.push(`p${p.pageIndex}: ${rects[i].id} sobrepõe ${rects[j].id}`);
  }
  return problems;
}
