import { describe, expect, it } from "vitest";
import { FORMATS, FORMAT_IDS, mmToPx } from "@/domain/formats";
import type { RenderCampaign } from "@/domain/campaign";
import type { PieceOverrides } from "@/domain/campaign";
import { checkLayout, layoutPiece, TAG_SHEET } from "@/layout/engine";
import { makeItems, testTemplate } from "./fixtures/test-template";

function campaign(items = makeItems(12)): RenderCampaign {
  return {
    id: "cmp_test", version: 3, title: "Ofertas da Semana", subtitle: null,
    validityText: "Ofertas válidas de 10/10 a 13/10/2026", legalText: null, items, isDemo: false,
    brand: { storeName: "Loja", logoUrl: null, colors: testTemplate.palette, phone: null, whatsapp: null, address: null, instagram: null, website: null, hours: null },
  };
}
const run = (formatId: keyof typeof FORMATS, items = makeItems(12), overrides: PieceOverrides = {}) =>
  layoutPiece({ campaign: campaign(items), format: FORMATS[formatId], template: testTemplate, overrides });

describe("layoutPiece — invariantes em todos os formatos", () => {
  for (const f of FORMAT_IDS) {
    for (const n of [1, 12, 40]) {
      it(`${f} com ${n} itens: sem sobreposição, dentro da página, cada item uma vez`, () => {
        const items = makeItems(n, { highlight: [0, 5], categories: ["Hortifruti", "Açougue", "Bebidas"] });
        for (const overrides of [{}, { order: "category" as const }] satisfies PieceOverrides[]) {
          const r = run(f, items, overrides);
          expect(checkLayout(r)).toEqual([]);
          const ids = r.pages.flatMap((p) => p.cells.map((c) => c.item.id));
          expect(ids.length).toBe(n);
          expect(new Set(ids).size).toBe(n);
          const fmt = FORMATS[f];
          for (const p of r.pages) {
            expect(p.cells.length).toBeLessThanOrEqual(fmt.maxItemsPerPage);
            expect(p.totalPages).toBe(r.pages.length);
            for (const c of p.cells) {
              // cards ficam dentro da área de produtos
              expect(c.rect.x).toBeGreaterThanOrEqual(p.body.x);
              expect(c.rect.y).toBeGreaterThanOrEqual(p.body.y);
              expect(c.rect.x + c.rect.w).toBeLessThanOrEqual(p.body.x + p.body.w);
              expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(p.body.y + p.body.h);
            }
          }
          const minPages = Math.ceil(n / fmt.maxItemsPerPage);
          expect(r.pages.length).toBeGreaterThanOrEqual(minPages);
          if (fmt.kind === "single") expect(r.pages.length).toBe(n);
          if (fmt.kind === "tags") expect(r.pages.length).toBe(Math.ceil(n / 8));
        }
      });
    }
  }

  it("é determinístico", () => {
    const items = makeItems(23, { highlight: [3] });
    expect(JSON.stringify(run("encarte_a4", items))).toBe(JSON.stringify(run("encarte_a4", items)));
  });
});

describe("paginação", () => {
  it("story com 40 itens vira várias telas, sem exceder o máximo", () => {
    const r = run("story", makeItems(40));
    expect(r.pages.length).toBeGreaterThanOrEqual(7);
    for (const p of r.pages) expect(p.cells.length).toBeLessThanOrEqual(FORMATS.story.maxItemsPerPage);
  });

  it("encarte: primeira página com cabeçalho maior, seguintes compactas", () => {
    const r = run("encarte_a4", makeItems(40));
    expect(r.pages.length).toBeGreaterThan(1);
    expect(r.pages[0].variant).toBe("first");
    expect(r.pages[1].variant).toBe("continuation");
    expect(r.pages[0].header.h).toBeGreaterThan(r.pages[1].header.h);
  });

  it("uma página só usa a variante single", () => {
    expect(run("encarte_a4", makeItems(5)).pages.map((p) => p.variant)).toEqual(["single"]);
  });

  it("última página equilibrada (sem item sozinho)", () => {
    const r = run("encarte_a4", makeItems(13)); // preferido 12
    expect(r.pages.length).toBe(2);
    const counts = r.pages.map((p) => p.cells.length);
    expect(Math.min(...counts)).toBeGreaterThan(1);
    expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1);
  });

  it("itemsPerPage acima do máximo gera aviso e não espreme", () => {
    const r = run("post_quadrado", makeItems(20), { itemsPerPage: 12 });
    expect(r.warnings.some((w) => w.code === "too_many_items")).toBe(true);
    for (const p of r.pages) expect(p.cells.length).toBeLessThanOrEqual(6);
  });

  it("itemsPerPage dentro do limite é respeitado", () => {
    const r = run("encarte_a4", makeItems(16), { itemsPerPage: 8 });
    expect(r.pages.map((p) => p.cells.length)).toEqual([8, 8]);
  });

  it("itens ocultos ficam fora da peça", () => {
    const items = makeItems(6);
    const r = run("story", items, { hiddenItemIds: [items[2].id] });
    const ids = r.pages.flatMap((p) => p.cells.map((c) => c.item.id));
    expect(ids).not.toContain(items[2].id);
    expect(ids.length).toBe(5);
    expect(r.warnings.some((w) => w.code === "item_hidden")).toBe(true);
  });
});

describe("destaques", () => {
  it("destaque vira card grande, posicionado primeiro, até o máximo por página", () => {
    const r = run("encarte_a4", makeItems(9, { highlight: [4, 7] }));
    const p = r.pages[0];
    const heroes = p.cells.filter((c) => c.size === "hero" || c.size === "large");
    expect(heroes.length).toBe(1); // maxHeroPerPage = 1
    expect(heroes[0].item.id).toBe("itm_004");
    const normal = p.cells.find((c) => c.size !== "hero" && c.size !== "large")!;
    expect(heroes[0].rect.w * heroes[0].rect.h).toBeGreaterThan(normal.rect.w * normal.rect.h * 1.8);
    // primeiro na ordem de leitura
    expect(p.cells[0].item.id).toBe("itm_004");
  });
});

describe("categorias", () => {
  it("agrupa por categoria com cabeçalhos de seção", () => {
    const items = makeItems(9, { categories: ["Hortifruti", "Açougue", "Bebidas"] });
    const r = run("encarte_a4", items, { order: "category" });
    expect(r.pages.length).toBe(1);
    expect(r.pages[0].sections.map((s) => s.title)).toEqual(["Hortifruti", "Açougue", "Bebidas"]);
    // itens da mesma categoria ficam abaixo do seu cabeçalho
    const p = r.pages[0];
    for (const c of p.cells) {
      const sec = [...p.sections].reverse().find((s) => s.rect.y <= c.rect.y)!;
      expect(sec.title).toBe(c.item.category);
    }
  });

  it("categoria que não cabe continua na página seguinte com (cont.)", () => {
    const items = makeItems(30, { categories: ["Mercearia"] });
    const r = run("encarte_a4", items, { order: "category" });
    expect(r.pages.length).toBeGreaterThan(1);
    expect(r.pages[1].sections[0].title).toBe("Mercearia (cont.)");
  });

  it("sem cabeçalhos quando showCategoryHeaders = false", () => {
    const r = run("encarte_a4", makeItems(9, { categories: ["A", "B"] }), { order: "category", showCategoryHeaders: false });
    expect(r.pages[0].sections).toEqual([]);
  });
});

describe("etiquetas", () => {
  it("8 etiquetas de 95×65 mm por folha A4, centralizadas, com vão para corte", () => {
    const r = run("etiqueta_a4", makeItems(10));
    expect(r.pages.length).toBe(2);
    const p = r.pages[0];
    expect(p.cells.length).toBe(8);
    expect(r.pages[1].cells.length).toBe(2);
    for (const c of p.cells) {
      expect(Math.abs(c.rect.w - mmToPx(TAG_SHEET.tagWmm))).toBeLessThanOrEqual(1);
      expect(Math.abs(c.rect.h - mmToPx(TAG_SHEET.tagHmm))).toBeLessThanOrEqual(1);
    }
    const xs = [...new Set(p.cells.map((c) => c.rect.x))].sort((a, b) => a - b);
    const ys = [...new Set(p.cells.map((c) => c.rect.y))].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    expect(ys.length).toBe(4);
    // centralizado: margens esquerda/direita e topo/base iguais (±1 px)
    const left = xs[0], right = FORMATS.etiqueta_a4.widthPx - (xs[1] + p.cells[1].rect.w);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    const top = ys[0], bottom = FORMATS.etiqueta_a4.heightPx - (ys[3] + p.cells[7].rect.h);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
    // vão entre etiquetas para as marcas de corte
    expect(xs[1] - (xs[0] + p.cells[0].rect.w)).toBeGreaterThanOrEqual(mmToPx(3));
  });
});

describe("avisos", () => {
  it("sem foto, preço inválido e nome longo", () => {
    const items = makeItems(24, { noImage: true, longName: [1] });
    items[0].offer = { ...items[0].offer, priceCents: null };
    const r = run("encarte_a4", items, { itemsPerPage: 24 });
    expect(r.warnings.filter((w) => w.code === "missing_image").length).toBe(24);
    expect(r.warnings.some((w) => w.code === "invalid_price" && w.itemId === items[0].id)).toBe(true);
    expect(r.warnings.some((w) => w.code === "long_name_truncated" && w.itemId === items[1].id)).toBe(true);
    for (const w of r.warnings) expect(w.message).toMatch(/[a-zà-ú]/);
  });
});

describe("cartaz", () => {
  it("um produto por página ocupando a área de produtos", () => {
    const r = run("cartaz_a3", makeItems(3));
    expect(r.pages.length).toBe(3);
    for (const p of r.pages) {
      expect(p.cells.length).toBe(1);
      expect(p.cells[0].size).toBe("hero");
    }
  });
});
