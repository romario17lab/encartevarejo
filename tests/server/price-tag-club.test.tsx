// D-01: nome do clube não é cortado com reticências em layouts densos (quebra em 2 linhas ou vira "Clube").
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyOffer, type Offer } from "@/domain/offer";
import { PriceTag, splitBalanced } from "@/templates/parts/PriceTag";
import type { Skin } from "@/templates/parts/types";

const skin = {
  fonts: { price: { family: "Anton", weight: 400 }, body: { family: "Inter", weight: 600 }, display: { family: "Anton", weight: 400 } },
  card: { bg: "#ffffff" },
  price: { shape: "band", bg: "#ffd23f", fg: "#1b1b1b", smallFg: "#1b1b1b", align: "center", strike: "#d62a1e", chipBg: "#1b1b1b", chipFg: "#ffffff" },
} as unknown as Skin;
const club = (name: string): Offer => ({ ...emptyOffer(), mode: "club", priceCents: 1299, clubCents: 1099, clubName: name });
const chipOf = (html: string) => {
  const i = html.indexOf("<div data-ev-club");
  if (i < 0) return null;
  const end = html.indexOf("</div></div>", i) + "</div></div>".length;
  const all = html.slice(i, end);
  return [all, all.slice(all.indexOf(">") + 1)] as const;
};

describe("PriceTag — clube (D-01)", () => {
  it("splitBalanced divide por palavras de forma equilibrada", () => {
    expect(splitBalanced("Clube Vantagens")).toEqual(["Clube", "Vantagens"]);
    expect(splitBalanced("Clube Mais Vantagens Já")).toEqual(["Clube Mais", "Vantagens Já"]);
    expect(splitBalanced("Fidelidade")).toBeNull();
  });

  it("espaço amplo: nome em uma linha", () => {
    const html = renderToStaticMarkup(<PriceTag offer={club("Clube Vantagens")} unit="un" x={0} y={0} w={400} h={220} skin={skin} />);
    const chip = chipOf(html)!;
    expect(chip[1]).toContain(">Clube Vantagens<");
    expect(chip[0]).not.toContain("ellipsis");
  });

  it("layout denso (card de encarte com 40 produtos): quebra em 2 linhas, sem reticências, preço intacto", () => {
    const html = renderToStaticMarkup(<PriceTag offer={club("Clube Vantagens")} unit="un" x={0} y={0} w={80} h={80} skin={skin} />);
    const chip = chipOf(html)!;
    expect(chip[1]).toContain(">Clube<");
    expect(chip[1]).toContain(">Vantagens<");
    expect(chip[0]).not.toContain("ellipsis");
    expect(html).toContain('aria-label="R$ 12,99/un | Clube Vantagens: R$ 10,99/un"');
    expect(html).toContain(">10<");
    expect(html).toContain(">,99<");
  });

  it("palavra única longa sem espaço: vira \"Clube\" em vez de reticências", () => {
    const html = renderToStaticMarkup(<PriceTag offer={club("SuperFidelidadeMaxima")} unit="un" x={0} y={0} w={60} h={60} skin={skin} />);
    const chip = chipOf(html)!;
    expect(chip[1]).toContain(">Clube<");
    expect(html).toContain("SuperFidelidadeMaxima: R$ 10,99"); // nome completo no texto acessível
  });
});
