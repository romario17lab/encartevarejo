import { z } from "zod";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { and, eq, isNull, lt } from "drizzle-orm";
import { parseBRL } from "@/domain/money";
import { UNITS, type Unit } from "@/domain/offer";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { sha256 } from "../signing";
import { storage } from "../storage";
import { normalizeName } from "../text";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { insertProduct } from "./products";

export const IMPORT_FIELDS = ["name", "brand", "category", "sizeLabel", "unit", "regularCents", "promoCents", "barcode", "costCents"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

type Cell = string | number | null;
export interface Sheet { columns: string[]; rows: Cell[][] }

// ---------------- Leitura de CSV/XLSX ----------------
export function decodeText(buf: Buffer): string {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { text = new TextDecoder("latin1").decode(buf); }
  return text.replace(/^﻿/, "");
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 } as Record<string, number>;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]!++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ",";
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text);
  }
  return String(v);
}

function finishSheet(raw: Cell[][]): Sheet {
  const rows = raw.filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  if (!rows.length) throw new AppError("validation", "A planilha está vazia.");
  const header = rows[0]!;
  const width = Math.max(...rows.map((r) => r.length));
  const seen = new Set<string>();
  const columns = Array.from({ length: width }, (_, i) => {
    let name = String(header[i] ?? "").trim() || `Coluna ${i + 1}`;
    while (seen.has(name)) name = `${name} (${i + 1})`;
    seen.add(name);
    return name;
  });
  const body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => {
    const c = r[i];
    return c === undefined || c === null || (typeof c === "string" && !c.trim()) ? null : typeof c === "string" ? c.trim() : c;
  }));
  if (body.length > MAX_IMPORT_ROWS) throw new AppError("validation", `A planilha tem ${body.length} linhas. O limite por importação é ${MAX_IMPORT_ROWS}.`);
  return { columns, rows: body };
}

export async function readSheet(buf: Buffer, fileName = ""): Promise<{ sheet: Sheet; kind: "csv" | "xlsx" }> {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (isZip || /\.xlsx$/i.test(fileName)) {
    if (!isZip) throw new AppError("validation", "Arquivo XLSX inválido.");
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new AppError("validation", "Não foi possível ler a planilha XLSX. Salve novamente no Excel e tente de novo."); }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError("validation", "A planilha não tem abas.");
    const raw: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as ExcelJS.CellValue[];
      raw.push(vals.slice(1).map(cellValue));
    });
    return { sheet: finishSheet(raw), kind: "xlsx" };
  }
  if (/\.xls$/i.test(fileName)) throw new AppError("validation", "Formato .xls antigo não é aceito. Salve como .xlsx ou .csv.");
  const text = decodeText(buf);
  if (/\u0000/.test(text.slice(0, 2000))) throw new AppError("validation", "Arquivo não reconhecido. Envie CSV ou XLSX.");
  const parsed = Papa.parse<string[]>(text, { delimiter: detectDelimiter(text), skipEmptyLines: "greedy" });
  return { sheet: finishSheet(parsed.data as Cell[][]), kind: "csv" };
}

// ---------------- Mapeamento sugerido ----------------
const HEADER_RULES: Array<[ImportField, RegExp]> = [
  ["barcode", /\b(ean|gtin|codigo de barras|cod barras|cod de barras|codigo|cod|sku)\b/],
  ["costCents", /^(preco de )?custo\b|\bcusto\b/],
  ["promoCents", /\b(oferta|promo|promocao|promocional|preco por|por)\b/],
  ["regularCents", /\b(preco normal|preco de|preco|de|valor|preco venda|preco de venda|pv)\b/],
  ["name", /\b(produto|descricao|nome|item|mercadoria)\b/],
  ["brand", /\b(marca|fabricante)\b/],
  ["category", /\b(categoria|secao|departamento|setor|grupo)\b/],
  ["sizeLabel", /\b(tamanho|gramatura|apresentacao|peso|volume|embalagem|conteudo)\b/],
  ["unit", /^(unidade|un|und|unid|medida|unidade de medida|un medida)$/],
];

export function suggestMapping(columns: string[]): Record<ImportField, string | null> {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, null])) as Record<ImportField, string | null>;
  const used = new Set<string>();
  for (const [field, re] of HEADER_RULES) {
    const col = columns.find((c) => !used.has(c) && re.test(normalizeName(c)));
    if (col && !mapping[field]) { mapping[field] = col; used.add(col); }
  }
  return mapping;
}

// ---------------- Normalização de valores ----------------
const UNIT_ALIASES: Record<string, Unit> = {
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un", pc: "un", peca: "un",
  kg: "kg", quilo: "kg", kilo: "kg", g: "g", gr: "g", grama: "g", "100g": "100g",
  l: "l", lt: "l", litro: "l", ml: "ml", pct: "pct", pacote: "pct", pc_: "pct", cx: "cx", caixa: "cx",
  dz: "dz", duzia: "dz", bdj: "bdj", bandeja: "bdj", fardo: "fardo", fd: "fardo", lata: "lata", lt_: "lata",
  garrafa: "garrafa", gfa: "garrafa", maco: "maco", mc: "maco", par: "par", m: "m", metro: "m", m2: "m2",
};
export function normalizeUnit(v: Cell): Unit | null | "invalid" {
  if (v === null) return null;
  const k = normalizeName(String(v)).replace(/\s/g, "");
  if (!k) return null;
  if (k in UNITS) return k as Unit;
  return UNIT_ALIASES[k] ?? "invalid";
}

const mappingSchema = z.record(z.string(), z.string().nullable().optional());

// ---------------- Prévia ----------------
export async function importPreview(ctx: TenantCtx, file: { data: Buffer; name: string }) {
  requirePermission(ctx, "products.write");
  if (!file.data.length) throw new AppError("validation", "Arquivo vazio.");
  if (file.data.length > MAX_IMPORT_BYTES) throw new AppError("validation", "O arquivo passa de 10 MB.");
  const { sheet, kind } = await readSheet(file.data, file.name);
  const db = getDb();
  // limpa importações abandonadas (mais de 24 h) desta conta
  const old = await db.select().from(schema.assets).where(and(eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.kind, "import"), lt(schema.assets.createdAt, new Date(Date.now() - 24 * 3600 * 1000))));
  for (const a of old) { await storage.delete(a.storageKey); await db.delete(schema.assets).where(eq(schema.assets.id, a.id)); }

  const importId = newId("ast");
  const storageKey = `${ctx.orgId}/imports/${importId}.${kind}`;
  const mime = kind === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  await storage.put(storageKey, file.data, mime);
  await db.insert(schema.assets).values({ id: importId, orgId: ctx.orgId, kind: "import", storageKey, mime, bytes: file.data.length, sha256: sha256(file.data), source: "importacao", originalName: file.name.slice(0, 200), createdBy: ctx.userId });
  return {
    importId, columns: sheet.columns, totalRows: sheet.rows.length,
    sampleRows: sheet.rows.slice(0, 10).map((r) => r.map((c) => (c === null ? "" : String(c)))),
    suggestedMapping: suggestMapping(sheet.columns),
  };
}

// ---------------- Confirmação ----------------
const commitSchema = z.object({
  importId: z.string().min(1),
  mapping: mappingSchema,
  options: z.object({ onDuplicate: z.enum(["skip", "update", "create"]).default("skip") }).default({ onDuplicate: "skip" }),
});

export async function importCommit(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "products.write");
  const input = commitSchema.parse(raw);
  const db = getDb();
  const [asset] = await db.select().from(schema.assets).where(and(eq(schema.assets.id, input.importId), eq(schema.assets.orgId, ctx.orgId), eq(schema.assets.kind, "import")));
  if (!asset) throw notFound("Importação");
  const buf = await storage.get(asset.storageKey).catch(() => { throw new AppError("not_found", "O arquivo da importação expirou. Envie a planilha novamente."); });
  const { sheet } = await readSheet(buf, asset.originalName ?? "");

  const colIndex: Partial<Record<ImportField, number>> = {};
  for (const [field, col] of Object.entries(input.mapping)) {
    if (!col) continue;
    if (!(IMPORT_FIELDS as readonly string[]).includes(field)) throw new AppError("validation", `Campo desconhecido no mapeamento: ${field}.`);
    const idx = sheet.columns.indexOf(col);
    if (idx < 0) throw new AppError("validation", `A coluna "${col}" não existe na planilha.`);
    colIndex[field as ImportField] = idx;
  }
  if (colIndex.name === undefined) throw new AppError("validation", "Escolha a coluna com o nome do produto.");
  const get = (r: Cell[], f: ImportField) => (colIndex[f] === undefined ? null : r[colIndex[f]!] ?? null);
  const str = (v: Cell, max: number) => (v === null ? null : String(v).trim().slice(0, max) || null);

  const result = { created: 0, updated: 0, skipped: 0, errors: [] as Array<{ row: number; message: string }>, warnings: [] as Array<{ row: number; message: string }> };
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: schema.products.id, barcode: schema.products.barcode, normalizedName: schema.products.normalizedName, sizeLabel: schema.products.sizeLabel })
      .from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt)));
    const sizeKey = (s: string | null) => normalizeName(s ?? "").replace(/\s/g, "");
    const byBarcode = new Map<string, string>();
    const byName = new Map<string, { id: string; barcode: string | null }>();
    for (const p of existing) {
      if (p.barcode) byBarcode.set(p.barcode, p.id);
      byName.set(`${p.normalizedName}|${sizeKey(p.sizeLabel)}`, { id: p.id, barcode: p.barcode });
    }
    for (let i = 0; i < sheet.rows.length; i++) {
      const r = sheet.rows[i]!;
      const rowNo = i + 2; // linha 1 é o cabeçalho
      const name = str(get(r, "name"), 120);
      if (!name) { result.errors.push({ row: rowNo, message: "Nome do produto vazio." }); continue; }
      const prices: Partial<Record<"regularCents" | "promoCents" | "costCents", number | null>> = {};
      let bad = false;
      for (const f of ["regularCents", "promoCents", "costCents"] as const) {
        const v = get(r, f);
        if (v === null) { prices[f] = null; continue; }
        const c = parseBRL(typeof v === "number" ? v : String(v));
        if (c === null || c > 100_000_000) { result.errors.push({ row: rowNo, message: `Valor inválido na coluna "${input.mapping[f]}": "${v}".` }); bad = true; break; }
        prices[f] = c;
      }
      if (bad) continue;
      let unit = normalizeUnit(get(r, "unit"));
      if (unit === "invalid") { result.warnings.push({ row: rowNo, message: `Unidade "${get(r, "unit")}" não reconhecida; ficou em branco.` }); unit = null; }
      let barcode = str(get(r, "barcode"), 40)?.replace(/\D/g, "") || null;
      if (typeof get(r, "barcode") === "number") barcode = String(Math.round(get(r, "barcode") as number));
      if (barcode && !/^\d{8,14}$/.test(barcode)) { result.warnings.push({ row: rowNo, message: `Código de barras "${barcode}" inválido; ficou em branco.` }); barcode = null; }
      const data = {
        name, brand: str(get(r, "brand"), 60), category: str(get(r, "category"), 60), sizeLabel: str(get(r, "sizeLabel"), 40),
        unit, barcode, regularCents: prices.regularCents ?? null, promoCents: prices.promoCents ?? null, costCents: prices.costCents ?? null,
      };
      const nameKey = `${normalizeName(name)}|${sizeKey(data.sizeLabel)}`;
      // duplicado: mesmo código de barras; senão mesmo nome normalizado + tamanho (se o existente não tiver outro código)
      const byNameHit = byName.get(nameKey);
      const dupId = (barcode && byBarcode.get(barcode)) || (byNameHit && (!barcode || !byNameHit.barcode) ? byNameHit.id : undefined);
      if (dupId && input.options.onDuplicate === "skip") { result.skipped++; continue; }
      if (dupId && input.options.onDuplicate === "update") {
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        // só sobrescreve com valores preenchidos na planilha (célula vazia não apaga dado existente)
        for (const [k, v] of Object.entries(data)) if (v !== null) patch[k] = v;
        patch.normalizedName = normalizeName(name);
        await tx.update(schema.products).set(patch).where(and(eq(schema.products.id, dupId), eq(schema.products.orgId, ctx.orgId)));
        result.updated++;
        continue;
      }
      const p = await insertProduct(ctx, data, tx);
      if (barcode) byBarcode.set(barcode, p.id);
      byName.set(nameKey, { id: p.id, barcode });
      result.created++;
    }
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "product.import", entityType: "product", entityId: null,
      summary: `Importação de planilha: ${result.created} criado(s), ${result.updated} atualizado(s), ${result.skipped} ignorado(s), ${result.errors.length} com erro.`,
      data: { file: asset.originalName, onDuplicate: input.options.onDuplicate } });
  });
  // arquivo temporário não é mais necessário
  await storage.delete(asset.storageKey);
  await db.delete(schema.assets).where(eq(schema.assets.id, asset.id));
  return result;
}
