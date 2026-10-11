import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { importCommit, importPreview, suggestMapping, detectDelimiter, decodeText } from "@/server/services/product-import";
import { listProducts } from "@/server/services/products";
import * as previewRoute from "@/app/api/products/import/preview/route";
import { call, makeOrg, makeProduct, req } from "./helpers";

const CSV = [
  "Código de barras;Descrição;Marca;Seção;Gramatura;Unidade;Preço normal;Oferta",
  "7891234567895;Arroz tipo 1 5kg;Marca A;Mercearia;5kg;PCT;29,90;24,90",
  "7891234567895;Arroz tipo 1 5kg repetido;Marca A;Mercearia;5kg;PCT;29,90;23,90",
  ";Feijão carioca;;Mercearia;1kg;UN;R$ 8,99;",
  ";Banana prata;;Hortifrúti;;KG;6,99;5,49",
  ";Produto com preço ruim;;;;UN;abc;",
  ";;;;;;;",
  ";Picanha;;Açougue;;QUILO;1.234,56;",
  ";Item sem unidade conhecida;;;;CAIXOTE;3,00;",
].join("\r\n");

describe("importação de planilhas", () => {
  it("detecta delimitador e codificação latin1", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter('a,"b;x",c')).toBe(",");
    expect(decodeText(Buffer.from("Seção;Preço", "latin1"))).toBe("Seção;Preço");
    expect(decodeText(Buffer.from("﻿Seção;Preço", "utf8"))).toBe("Seção;Preço");
  });

  it("sugere mapeamento pelos cabeçalhos em português", () => {
    const m = suggestMapping(["Código de barras", "Descrição", "Marca", "Seção", "Gramatura", "Unidade", "Preço normal", "Oferta", "Custo"]);
    expect(m).toEqual({ barcode: "Código de barras", name: "Descrição", brand: "Marca", category: "Seção", sizeLabel: "Gramatura", unit: "Unidade", regularCents: "Preço normal", promoCents: "Oferta", costCents: "Custo" });
    const m2 = suggestMapping(["Produto", "Apresentação", "UN", "De", "Por", "EAN"]);
    expect(m2).toMatchObject({ name: "Produto", sizeLabel: "Apresentação", unit: "UN", regularCents: "De", promoCents: "Por", barcode: "EAN" });
  });

  it("prévia + confirmação com duplicados e erros por linha (CSV latin1)", async () => {
    const org = await makeOrg();
    await makeProduct(org, { name: "Banana Prata", unit: "kg", regularCents: 100 });
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(CSV, "latin1")], { type: "text/csv" }), "produtos.csv");
    const prev = await call(previewRoute.POST, req("POST", "/api/products/import/preview", { token: org.token, form }));
    expect(prev.status).toBe(200);
    expect(prev.json.columns[1]).toBe("Descrição");
    expect(prev.json.totalRows).toBe(7);
    expect(prev.json.suggestedMapping.name).toBe("Descrição");
    const r = await importCommit(org.ctx, { importId: prev.json.importId, mapping: prev.json.suggestedMapping, options: { onDuplicate: "skip" } });
    expect(r.created).toBe(4); // arroz, feijão, picanha, item sem unidade
    expect(r.skipped).toBe(2); // arroz repetido (código) e banana (nome igual ao existente)
    expect(r.errors).toEqual([{ row: 6, message: expect.stringMatching(/Valor inválido/) }]);
    expect(r.warnings.some((w) => /CAIXOTE/.test(w.message))).toBe(true);
    const all = (await listProducts(org.ctx, { limit: 100 })).products;
    const arroz = all.find((p) => p.name === "Arroz tipo 1 5kg")!;
    expect(arroz).toMatchObject({ regularCents: 2990, promoCents: 2490, unit: "pct", barcode: "7891234567895", category: "Mercearia", sizeLabel: "5kg" });
    expect(all.find((p) => p.name === "Picanha")).toMatchObject({ unit: "kg", regularCents: 123456 });
    expect(all.find((p) => p.name === "Feijão carioca")).toMatchObject({ regularCents: 899, promoCents: null, unit: "un" });
    expect(all.find((p) => p.name === "Item sem unidade conhecida")!.unit).toBeNull();
    // arquivo temporário removido após confirmar
    await expect(importCommit(org.ctx, { importId: prev.json.importId, mapping: prev.json.suggestedMapping })).rejects.toMatchObject({ code: "not_found" });
  });

  it("onDuplicate=update atualiza sem apagar dados existentes; XLSX", async () => {
    const org = await makeOrg();
    await makeProduct(org, { name: "Leite integral", sizeLabel: "1L", unit: "cx", regularCents: 500, promoCents: null, barcode: "7890000000017", brand: "Marca X" });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan1");
    ws.addRow(["EAN", "Produto", "Tamanho", "Preço", "Promo", "Marca"]);
    ws.addRow(["7890000000017", "Leite integral", "1L", 5.49, 4.79, null]);
    ws.addRow([null, "Café 500g", "500g", 19.9, null, "Marca Y"]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const prev = await importPreview(org.ctx, { data: buf, name: "lista.xlsx" });
    expect(prev.columns).toEqual(["EAN", "Produto", "Tamanho", "Preço", "Promo", "Marca"]);
    const r = await importCommit(org.ctx, { importId: prev.importId, mapping: prev.suggestedMapping, options: { onDuplicate: "update" } });
    expect(r).toMatchObject({ created: 1, updated: 1, skipped: 0, errors: [] });
    const leite = (await listProducts(org.ctx, { q: "leite" })).products[0]!;
    expect(leite).toMatchObject({ regularCents: 549, promoCents: 479, brand: "Marca X", unit: "cx" });
    const cafe = (await listProducts(org.ctx, { q: "cafe" })).products[0]!;
    expect(cafe.regularCents).toBe(1990);
  });

  it("recusa arquivos inválidos", async () => {
    const org = await makeOrg();
    await expect(importPreview(org.ctx, { data: Buffer.from(""), name: "x.csv" })).rejects.toMatchObject({ code: "validation" });
    await expect(importPreview(org.ctx, { data: Buffer.from("PK\u0003\u0004lixo"), name: "x.xlsx" })).rejects.toMatchObject({ code: "validation" });
  });
});
