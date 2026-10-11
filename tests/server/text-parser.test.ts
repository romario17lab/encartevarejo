import { describe, expect, it } from "vitest";
import { parseProductText } from "@/server/services/text-parser";

const parse = (t: string) => parseProductText(t).rows;

describe("parser de lista em texto", () => {
  it("reconhece nome, tamanho, unidade e preço", () => {
    const rows = parse(["Arroz Tio João 5kg 24,90", "Banana prata kg 5,99", "Coca-Cola 2L - R$ 9,99", "Picanha bovina 69,90/kg", "Ovos brancos dz 12,90", "Leite integral caixa 1L R$ 4,79"].join("\n"));
    expect(rows.map((r) => [r.name, r.sizeLabel, r.unit, r.priceCents])).toEqual([
      ["Arroz Tio João", "5kg", null, 2490],
      ["Banana prata", null, "kg", 599],
      ["Coca-Cola", "2L", null, 999],
      ["Picanha bovina", null, "kg", 6990],
      ["Ovos brancos", null, "dz", 1290],
      ["Leite integral", "1L", "cx", 479],
    ]);
  });

  it("nunca inventa unidade: deixa null com aviso (sugestão separada)", () => {
    const [r] = parse("Arroz Tio João 5kg 24,90");
    expect(r!.unit).toBeNull();
    expect(r!.suggestedUnit).toBe("un");
    expect(r!.issues.join(" ")).toMatch(/Unidade não informada/);
  });

  it("nunca inventa preço: sem preço fica null com aviso", () => {
    const [r] = parse("Detergente 500ml");
    expect(r!.priceCents).toBeNull();
    expect(r!.regularCents).toBeNull();
    expect(r!.issues.join(" ")).toMatch(/Preço não encontrado/);
  });

  it("preço anterior só quando a linha diz \"de ... por ...\"", () => {
    const [a, b] = parse("Doce de leite 400g de 8,99 por 6,99\nCafé 500g 19,90 21,90");
    expect(a).toMatchObject({ name: "Doce de leite", regularCents: 899, priceCents: 699 });
    expect(b!.priceCents).toBeNull();
    expect(b!.regularCents).toBeNull();
    expect(b!.issues.join(" ")).toMatch(/Mais de um preço/);
  });

  it("\"leve X pague Y\" não vira oferta automática", () => {
    const [r] = parse("Leve 3 pague 2 Sabonete 90g 2,49");
    expect(r!.name).toBe("Sabonete");
    expect(r!.priceCents).toBe(249);
    expect(r!.issues.join(" ")).toMatch(/leve X pague Y/);
  });

  it("ignora linhas vazias e numeração", () => {
    const rows = parse("\n\n1. Café 500g 19,90\n- Açúcar 1kg 4,99\n----\n");
    expect(rows.map((r) => [r.line, r.name])).toEqual([[3, "Café"], [4, "Açúcar"]]);
  });

  it("tamanho com decimal não vira preço", () => {
    const [r] = parse("Açúcar 1,50kg 5,49");
    expect(r).toMatchObject({ sizeLabel: "1,50kg", priceCents: 549 });
  });
});
