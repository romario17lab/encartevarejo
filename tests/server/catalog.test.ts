import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { uploadImage, readAsset } from "@/server/services/assets";
import { createProduct, listProducts, updateProduct, bulkPricePreview, bulkPriceCommit, findDuplicates, upsertStorePrices, listStorePrices } from "@/server/services/products";
import * as assetsRoute from "@/app/api/assets/route";
import * as productsRoute from "@/app/api/products/route";
import { addMember, call, makeOrg, makeProduct, req } from "./helpers";

describe("imagens", () => {
  it("normaliza: reduz para 2000px sem distorcer, converte em WebP, deduplica", async () => {
    const org = await makeOrg();
    const jpg = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#33aa55" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "x" } } }).toBuffer();
    const form = new FormData();
    form.append("file", new Blob([jpg], { type: "image/jpeg" }), "foto.jpg");
    form.append("source", "upload_lojista");
    form.append("sourceNote", "Foto tirada na loja");
    const r = await call(assetsRoute.POST, req("POST", "/api/assets", { token: org.token, form }));
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ width: 2000, height: 1000, mime: "image/webp" });
    const { data, asset } = await readAsset(r.json.id, { ctx: org.ctx });
    const meta = await sharp(data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(asset.sourceNote).toBe("Foto tirada na loja");
    const again = await uploadImage(org.ctx, { data: jpg });
    expect(again).toMatchObject({ id: r.json.id, deduplicated: true });
  });

  it("gira pela orientação EXIF e mantém PNG com transparência", async () => {
    const org = await makeOrg();
    const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#123456" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const a = await uploadImage(org.ctx, { data: rotated });
    expect([a.width, a.height]).toEqual([200, 400]);
    const alpha = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const b = await uploadImage(org.ctx, { data: alpha });
    expect(b.mime).toBe("image/png");
  });

  it("recusa arquivos que não são imagem, GIF e dimensões gigantes", async () => {
    const org = await makeOrg();
    await expect(uploadImage(org.ctx, { data: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>") })).rejects.toMatchObject({ code: "validation" });
    await expect(uploadImage(org.ctx, { data: Buffer.from("isto não é imagem") })).rejects.toMatchObject({ code: "validation" });
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    await expect(uploadImage(org.ctx, { data: gif })).rejects.toMatchObject({ code: "validation" });
    const huge = await sharp({ create: { width: 6001, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(uploadImage(org.ctx, { data: huge })).rejects.toMatchObject({ code: "validation", message: expect.stringMatching(/6000/) });
    const aprovador = await addMember(org, "aprovador");
    const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(uploadImage(aprovador.ctx, { data: small })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("catálogo", () => {
  it("CRUD com validação, nome normalizado, filtros e paginação por cursor", async () => {
    const org = await makeOrg();
    const p = await createProduct(org.ctx, { name: "  Café   Torrado  Moído ", unit: "pct", regularCents: 1990, costCents: 1200 });
    expect(p.normalizedName).toBe("cafe torrado moido");
    expect(p.costCents).toBe(1200);
    await expect(createProduct(org.ctx, { name: "x", unit: "caixote" })).rejects.toBeTruthy();
    await expect(createProduct(org.ctx, { name: "x", regularCents: 4.99 })).rejects.toBeTruthy();
    await expect(createProduct(org.ctx, { name: "x", barcode: "12" })).rejects.toBeTruthy();
    for (let i = 0; i < 5; i++) await makeProduct(org, { name: `Item ${i}`, unit: i % 2 ? null : "un", category: "Mercearia" });
    expect((await listProducts(org.ctx, { q: "CAFÉ" })).products.map((x) => x.id)).toEqual([p.id]);
    expect((await listProducts(org.ctx, { category: "mercearia" })).products).toHaveLength(5);
    expect((await listProducts(org.ctx, { issues: "sem_imagem" })).products).toHaveLength(6);
    const inc = (await listProducts(org.ctx, { issues: "incompleto" })).products;
    expect(inc.length).toBe(6);
    const page1 = await listProducts(org.ctx, { limit: 4 });
    const page2 = await listProducts(org.ctx, { limit: 4, cursor: page1.nextCursor });
    expect(page1.products).toHaveLength(4);
    expect(page2.products).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.products, ...page2.products].map((x) => x.id)).size).toBe(6);
    // aprovador vê o catálogo sem custo
    const ap = await addMember(org, "aprovador");
    const seen = (await listProducts(ap.ctx, { q: "cafe" })).products[0]!;
    expect("costCents" in seen).toBe(false);
    const viaRoute = await call(productsRoute.GET, req("GET", "/api/products?q=cafe", { token: ap.token }));
    expect(JSON.stringify(viaRoute.json)).not.toMatch(/costCents/);
    const arch = await updateProduct(org.ctx, p.id, { archived: true });
    expect(arch.archivedAt).not.toBeNull();
    expect((await listProducts(org.ctx, { q: "cafe" })).products).toHaveLength(0);
  });

  it("atualização de preços em massa: prévia com alertas e confirmação com auditoria", async () => {
    const org = await makeOrg();
    const a = await makeProduct(org, { regularCents: 1000, promoCents: 800 });
    const b = await makeProduct(org, { regularCents: 500, promoCents: null });
    const input = { changes: [{ productId: a.id, regularCents: 1400 }, { productId: b.id, regularCents: 0 }] };
    const prev = await bulkPricePreview(org.ctx, input);
    const ia = prev.items.find((i) => i.productId === a.id)!;
    expect(ia).toMatchObject({ oldRegularCents: 1000, newRegularCents: 1400, regularChangePct: 40, flags: ["aumento_acima_30"] });
    expect(prev.items.find((i) => i.productId === b.id)!.flags).toContain("preco_zero");
    const other = await makeOrg();
    await expect(bulkPricePreview(other.ctx, input)).rejects.toMatchObject({ code: "not_found" });
    const r = await bulkPriceCommit(org.ctx, input);
    expect(r.updated).toBe(2);
    const audit = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.action, "product.bulk_price"));
    expect(audit.some((x) => x.orgId === org.orgId)).toBe(true);
  });

  it("prováveis duplicados por código de barras e nome parecido", async () => {
    const org = await makeOrg();
    await makeProduct(org, { name: "Leite Integral 1L", sizeLabel: "1L", barcode: "7890000000017" });
    await makeProduct(org, { name: "Leite integral UHT", sizeLabel: "1L", barcode: "7890000000017" });
    await makeProduct(org, { name: "Biscoito recheado chocolate", sizeLabel: "130g" });
    await makeProduct(org, { name: "Biscoito recheado chocolat", sizeLabel: "130 g" });
    await makeProduct(org, { name: "Biscoito recheado morango", sizeLabel: "130g" });
    const { groups } = await findDuplicates(org.ctx);
    expect(groups.map((g) => [g.reason, g.products.length])).toEqual([["codigo_de_barras", 2], ["nome_parecido", 2]]);
  });

  it("preços por filial", async () => {
    const org = await makeOrg();
    const p = await makeProduct(org);
    const rows = await upsertStorePrices(org.ctx, org.storeId, { prices: [{ productId: p.id, regularCents: 1111, promoCents: null }] });
    expect(rows[0]).toMatchObject({ productId: p.id, regularCents: 1111 });
    expect(await listStorePrices(org.ctx, org.storeId)).toHaveLength(1);
    const other = await makeOrg();
    await expect(upsertStorePrices(other.ctx, org.storeId, { prices: [{ productId: p.id, regularCents: 1, promoCents: null }] })).rejects.toMatchObject({ code: "not_found" });
    await expect(upsertStorePrices(org.ctx, org.storeId, { prices: [{ productId: (await makeProduct(other)).id, regularCents: 1, promoCents: null }] })).rejects.toMatchObject({ code: "not_found" });
  });
});
