import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FORMATS } from "@/domain/formats";
import type { RenderCampaign } from "@/domain/campaign";
import { PieceRenderer, computePieceLayout } from "@/render/PieceRenderer";
import { mergeColors } from "@/render/colors";
import { offersFingerprint } from "@/render/fingerprint";
import { makeItems, testTemplate } from "./fixtures/test-template";

const campaign = (n: number): RenderCampaign => ({
  id: "cmp_x", version: 7, title: "Ofertas da Semana", subtitle: null, validityText: "Ofertas válidas de 10/10 a 13/10/2026", legalText: null,
  items: makeItems(n), isDemo: false,
  brand: { storeName: "Loja", logoUrl: null, colors: { primary: "#123456", secondary: "#abcdef", accent: "#ff0000", text: "#000000", background: "#ffffff" }, phone: null, whatsapp: null, address: null, instagram: null, website: null, hours: null },
});

describe("PieceRenderer", () => {
  it("renderiza a página pedida em tamanho nativo com preço exato e marcas de versão", () => {
    const html = renderToStaticMarkup(<PieceRenderer campaign={campaign(3)} template={testTemplate} format="story" overrides={{}} />);
    expect(html).toContain("R$ 4,99");
    expect(html).toContain('data-ev-version="7"');
    expect(html).toContain(`data-ev-offers="${offersFingerprint(campaign(3).items)}"`);
    expect(html).toContain("width:1080px;height:1920px");
    expect(html.match(/data-ev-page="/g)?.length).toBe(1);
  });

  it("renderiza todas as páginas empilhadas (PDF)", () => {
    const c = campaign(30);
    const layout = computePieceLayout(c, testTemplate, "encarte_a4", {})!;
    const html = renderToStaticMarkup(<PieceRenderer campaign={c} template={testTemplate} format={FORMATS.encarte_a4} pageIndex="all" />);
    expect(html.match(/data-ev-page="/g)?.length).toBe(layout.pages.length);
    expect(layout.pages.length).toBeGreaterThan(1);
  });

  it("aplica título personalizado e cores (modelo → loja → peça)", () => {
    const html = renderToStaticMarkup(<PieceRenderer campaign={campaign(2)} template={testTemplate} format="post_quadrado" overrides={{ title: "Feirão", colors: { accent: "#00ff00" } }} />);
    expect(html).toContain("Feirão");
    const colors = mergeColors(testTemplate, campaign(1).brand.colors, { accent: "#00ff00" });
    expect(colors).toMatchObject({ primary: "#123456", accent: "#00ff00" });
    expect(mergeColors({ ...testTemplate, useBrandColors: false }, campaign(1).brand.colors).primary).toBe(testTemplate.palette.primary);
  });

  it("mostra erro amigável para modelo inexistente", () => {
    const html = renderToStaticMarkup(<PieceRenderer campaign={campaign(1)} template={{ id: "nao-existe" }} format="story" />);
    expect(html).toContain("Modelo não encontrado");
  });

  it("impressão digital muda quando um preço muda", () => {
    const a = campaign(3).items;
    const b = a.map((i, k) => (k === 1 ? { ...i, offer: { ...i.offer, priceCents: 1 } } : i));
    expect(offersFingerprint(a)).not.toBe(offersFingerprint(b));
  });
});
