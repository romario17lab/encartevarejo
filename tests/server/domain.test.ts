import { describe, expect, it } from "vitest";
import { parseBRL, formatBRL, discountPercent } from "@/domain/money";
import { emptyOffer, validateOffer, type Offer } from "@/domain/offer";

const offer = (o: Partial<Offer>): Offer => ({ ...emptyOffer(), ...o });

describe("dinheiro em centavos", () => {
  it("interpreta formatos brasileiros", () => {
    expect(parseBRL("4,99")).toBe(499);
    expect(parseBRL("R$ 4,99")).toBe(499);
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("1.234")).toBe(123400);
    expect(parseBRL("4.99")).toBe(499);
    expect(parseBRL("0,5")).toBe(50);
    expect(parseBRL("1234")).toBe(123400);
    expect(parseBRL(19.9)).toBe(1990);
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("-1")).toBeNull();
    expect(parseBRL("4,999")).toBeNull();
    expect(parseBRL("")).toBeNull();
  });
  it("formata em R$", () => {
    expect(formatBRL(499)).toBe("R$ 4,99");
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(100000000, { symbol: false })).toBe("1.000.000,00");
  });
  it("desconto arredonda para baixo", () => {
    expect(discountPercent(699, 499)).toBe(28);
    expect(discountPercent(499, 699)).toBe(0);
  });
});

describe("validateOffer", () => {
  it("exige unidade e preço", () => {
    const issues = validateOffer(offer({ priceCents: null }), { unit: null });
    expect(issues.map((i) => i.field).sort()).toEqual(["priceCents", "unit"]);
    expect(validateOffer(offer({ priceCents: 0 }), { unit: "un" })[0]!.message).toMatch(/zero/);
    expect(validateOffer(offer({ priceCents: 499 }), { unit: "un" })).toEqual([]);
  });
  it("de/por precisa de preço anterior maior", () => {
    expect(validateOffer(offer({ mode: "from_to", priceCents: 499 }), { unit: "un" })[0]!.field).toBe("regularCents");
    expect(validateOffer(offer({ mode: "from_to", priceCents: 499, regularCents: 499 }), { unit: "un" })[0]!.level).toBe("error");
    expect(validateOffer(offer({ mode: "from_to", priceCents: 499, regularCents: 699 }), { unit: "un" })).toEqual([]);
    expect(validateOffer(offer({ mode: "from_to", priceCents: 100, regularCents: 1000 }), { unit: "un" })[0]).toMatchObject({ level: "warning" });
  });
  it("combo e clube", () => {
    expect(validateOffer(offer({ mode: "combo", priceCents: null }), { unit: "un" }).map((i) => i.field).sort()).toEqual(["comboCents", "comboQty"]);
    expect(validateOffer(offer({ mode: "combo", priceCents: null, comboQty: 3, comboCents: 1500, regularCents: 500 }), { unit: "un" })[0]!.field).toBe("comboCents");
    expect(validateOffer(offer({ mode: "combo", priceCents: null, comboQty: 3, comboCents: 1200, regularCents: 500 }), { unit: "un" })).toEqual([]);
    expect(validateOffer(offer({ mode: "club", priceCents: 500, clubCents: 600 }), { unit: "un" })[0]!.field).toBe("clubCents");
    expect(validateOffer(offer({ mode: "min_qty", priceCents: 500 }), { unit: "un" })[0]!.field).toBe("minQty");
  });
  it("margem mínima gera aviso", () => {
    const r = validateOffer(offer({ priceCents: 1000 }), { unit: "un", costCents: 950, minMarginBp: 1000 });
    expect(r[0]).toMatchObject({ level: "warning" });
    expect(r[0]!.message).toMatch(/5,0%/);
  });
});
