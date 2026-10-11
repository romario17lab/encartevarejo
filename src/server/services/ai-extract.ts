import { z } from "zod";
import sharp, { type Metadata } from "sharp";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { UNITS, unitSchema, type Unit } from "@/domain/offer";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError } from "../errors";
import { writeAudit } from "../audit";
import { normalizeName, similarity } from "../text";
import { requirePermission } from "../tenant";
import { aiConfig } from "../ai/config";
import { claudeJson, S, type ClaudeBlock } from "../ai/claude";
import { AiNotConfiguredError } from "../ai/http";
import { appearsIn, numbersInText, priceTextToCents, wordCoverage } from "../ai/guards";
import { getAiRequest, markAiRequest, runAiRequest } from "../ai/requests";
import { insertProduct, productInputSchema, updateProduct } from "./products";

// Extração de listas por IA (texto colado, foto de lista/tabela de preços ou PDF).
// O resultado NUNCA é salvo direto: volta para a tela de revisão, e só as linhas confirmadas uma a uma
// pelo usuário viram produtos (extractCommit). Campos ausentes na fonte ficam null.

export const MAX_AI_TEXT = 20_000;
export const MAX_AI_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
const MAX_LINES = 300;

export type SourceType = "texto" | "imagem" | "pdf";
export type Confidence = "alta" | "media" | "baixa";
const CONF = ["alta", "media", "baixa"] as const;
const CONF_FIELDS = ["name", "brand", "size", "unit", "price", "conditions"] as const;

export interface CatalogMatch { productId: string; name: string; sizeLabel: string | null; brand: string | null; regularCents: number | null; promoCents: number | null; kind: "igual" | "parecido" }

export interface ExtractedLine {
  index: number;
  sourceText: string | null;
  name: string | null;
  brand: string | null;
  sizeLabel: string | null;
  unit: Unit | null;
  regularCents: number | null;
  promoCents: number | null;
  conditions: string | null;
  /** sugestão de categoria (não vem da fonte; o usuário aceita ou troca) */
  category: string | null;
  confidence: Record<(typeof CONF_FIELDS)[number], Confidence>;
  /** avisos para a revisão (campos removidos por não aparecerem na fonte, preços a conferir...) */
  flags: string[];
  /** preço lido de imagem/PDF: sempre conferir com a fonte */
  priceCheck: boolean;
  match: CatalogMatch | null;
}

interface ModelLine {
  sourceText: string; name: string | null; brand: string | null; size: string | null; unit: string | null;
  price: string | null; priceFrom: string | null; conditions: string | null; categorySuggestion: string | null;
  confidence: Record<(typeof CONF_FIELDS)[number], Confidence>;
}
interface ModelOutput { lines: ModelLine[]; notes: string | null }

const UNIT_KEYS = Object.keys(UNITS) as Unit[];

const LINE_SCHEMA = S.obj({
  sourceText: S.str(),
  name: S.nullableStr(),
  brand: S.nullableStr(),
  size: S.nullableStr(),
  unit: { anyOf: [{ type: "string", enum: UNIT_KEYS }, { type: "null" }] },
  price: S.nullableStr(),
  priceFrom: S.nullableStr(),
  conditions: S.nullableStr(),
  categorySuggestion: S.nullableStr(),
  confidence: S.obj(Object.fromEntries(CONF_FIELDS.map((f) => [f, S.enumOf(CONF)]))),
});
export const EXTRACT_SCHEMA = S.obj({ lines: S.arr(LINE_SCHEMA), notes: S.nullableStr() });

const SYSTEM = `Você lê listas de produtos de supermercados brasileiros (lista colada, foto de lista escrita à mão ou impressa, tabela de preços ou página de PDF) e devolve as linhas estruturadas para o lojista revisar antes de salvar.

Regras obrigatórias:
- Copie apenas o que está escrito na fonte. Nunca invente, complete ou estime produto, preço, unidade, marca, tamanho ou condição.
- Quando um campo não estiver escrito na fonte, devolva null. Um campo null é sempre melhor do que um palpite.
- sourceText: o trecho exato da fonte que originou a linha (para texto, a linha copiada sem alterações).
- price: o preço anunciado, copiado como está escrito (ex.: "24,90"). priceFrom: o preço anterior, só quando a fonte disser explicitamente "de X por Y" (X vai em priceFrom, Y em price).
- unit: a unidade de venda somente se estiver escrita (ex.: "kg" em "Banana kg 4,99", "un", "cada", "pct", "dz"). A embalagem/gramatura (ex.: "5kg", "350ml") vai em size, não em unit.
- brand: somente se a marca estiver escrita na fonte.
- conditions: condições escritas (ex.: "limite 3 por cliente", "no Pix"); senão null.
- categorySuggestion: uma categoria curta de supermercado para o produto (prefira uma das categorias existentes da loja, se fornecidas). É só uma sugestão; pode ser null.
- confidence: sua confiança em cada campo lido (alta, media, baixa). Use baixa para letra ilegível ou valor duvidoso.
- Ignore cabeçalhos, totais, telefones, endereços e datas; não crie linhas para eles. Não inclua dados pessoais.
- notes: observação curta em português sobre problemas de leitura (ex.: "parte da foto está cortada"), ou null.`;

// ---------------- Arquivo enviado ----------------
export interface ExtractFile { data: Buffer; name: string; type: string }

async function prepareFile(file: ExtractFile): Promise<{ block: ClaudeBlock; sourceType: SourceType; summary: Record<string, unknown> }> {
  if (!file.data.length) throw new AppError("validation", "Arquivo vazio.");
  if (file.data.length > MAX_AI_FILE_BYTES) throw new AppError("validation", "O arquivo passa de 8 MB. Envie um arquivo menor.");
  const isPdf = file.data.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) {
    const raw = file.data.toString("latin1");
    const pages = (raw.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
    if (pages > MAX_PDF_PAGES) throw new AppError("validation", `O PDF tem ${pages} páginas. Envie no máximo ${MAX_PDF_PAGES} páginas por vez (ou uma foto da página com a lista).`);
    if (/\/Encrypt\b/.test(raw)) throw new AppError("validation", "PDF protegido por senha não é aceito. Envie uma foto da página.");
    return { block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") } }, sourceType: "pdf", summary: { tipo: "pdf", bytes: file.data.length, paginas: pages || null } };
  }
  let meta: Metadata;
  try { meta = await sharp(file.data, { failOn: "error" }).metadata(); } catch {
    throw new AppError("validation", "Arquivo não reconhecido. Envie uma foto (JPG, PNG ou WebP) ou um PDF.");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) throw new AppError("validation", "Formato não aceito. Envie JPG, PNG, WebP ou PDF.");
  if (meta.pages && meta.pages > 1) throw new AppError("validation", "Imagens animadas não são aceitas.");
  if (!meta.width || !meta.height || meta.width > 8000 || meta.height > 8000) throw new AppError("validation", "Imagem com dimensões inválidas (máximo 8000 px).");
  // reduz para ~1568 px no lado maior (suficiente para leitura e mais barato), sem metadados
  const out = await sharp(file.data).rotate().resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { block: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: out.toString("base64") } }, sourceType: "imagem", summary: { tipo: "imagem", bytes: file.data.length, largura: meta.width, altura: meta.height } };
}

// ---------------- Conferência (trava contra invenção) ----------------
const UNIT_WORDS: Record<Unit, string[]> = {
  un: ["un", "und", "unid", "unidade", "unidades", "cada", "uni"], kg: ["kg", "quilo", "kilo", "kgs"], g: ["g", "gr", "grama", "gramas"], "100g": ["100g", "100 g"],
  l: ["l", "lt", "litro", "litros"], ml: ["ml"], pct: ["pct", "pacote", "pac", "pc"], cx: ["cx", "caixa"], dz: ["dz", "duzia"], bdj: ["bdj", "bandeja"],
  fardo: ["fardo", "fd"], lata: ["lata", "lt"], garrafa: ["garrafa", "gfa", "gf"], maco: ["maco", "mc"], par: ["par"], m: ["m", "metro"], m2: ["m2", "metro quadrado"],
};
function unitWritten(unit: Unit, source: string): boolean {
  const src = ` ${normalizeName(source).replace(/(\d)([a-z])/g, "$1 $2")} `;
  return UNIT_WORDS[unit].some((w) => src.includes(` ${w} `));
}

const clip = (v: string | null | undefined, max: number) => { const t = v?.trim(); return t ? t.slice(0, max) : null; };

/**
 * Confere cada linha do modelo contra a fonte. Para texto, todo preço precisa aparecer literalmente no texto
 * (senão é removido e sinalizado); marca, tamanho, unidade e condições ausentes no texto viram null.
 * Para imagem/PDF não há como conferir: todos os preços ficam marcados como "conferir".
 */
export function guardLines(model: ModelOutput, sourceType: SourceType, sourceText: string | null): Omit<ExtractedLine, "match">[] {
  const lines = (Array.isArray(model?.lines) ? model.lines : []).slice(0, MAX_LINES);
  const textNumbers = sourceType === "texto" && sourceText ? numbersInText(sourceText) : null;
  return lines.map((l, index) => {
    const flags: string[] = [];
    const confidence = Object.fromEntries(CONF_FIELDS.map((f) => [f, CONF.includes(l?.confidence?.[f]) ? l.confidence[f] : "baixa"])) as ExtractedLine["confidence"];
    const src = clip(l?.sourceText, 300);
    let name = clip(l?.name, 120);
    let brand = clip(l?.brand, 60);
    let sizeLabel = clip(l?.size, 40);
    let unit: Unit | null = l?.unit && (UNIT_KEYS as string[]).includes(l.unit) ? (l.unit as Unit) : null;
    let conditions = clip(l?.conditions, 160);
    const category = clip(l?.categorySuggestion, 60);
    let price = priceTextToCents(l?.price);
    let priceFrom = priceTextToCents(l?.priceFrom);
    if (l?.price && price == null) flags.push(`Preço "${String(l.price).slice(0, 20)}" ilegível: informe na revisão.`);

    if (sourceType === "texto" && sourceText) {
      // trecho de origem: só vale se existir de fato no texto colado
      const lineSrc = src && appearsIn(src, sourceText) ? src : null;
      const local = lineSrc ?? sourceText;
      const localNumbers = lineSrc ? numbersInText(lineSrc) : textNumbers!;
      for (const [label, get, set] of [
        ["Preço", () => price, (v: null) => { price = v; }],
        ["Preço anterior", () => priceFrom, (v: null) => { priceFrom = v; }],
      ] as const) {
        const c = get();
        if (c == null) continue;
        if (!textNumbers!.has(c)) { set(null); flags.push(`${label} removido: o valor não aparece no texto original. Informe na revisão.`); confidence.price = "baixa"; }
        else if (!localNumbers.has(c)) { flags.push(`${label}: confira, o valor não está na mesma linha do produto.`); confidence.price = "baixa"; }
      }
      if (name && wordCoverage(name, local) < 0.5) { flags.push("Nome não confere com o texto: confira."); confidence.name = "baixa"; }
      if (brand && !appearsIn(brand, local)) { brand = null; flags.push("Marca removida: não aparece no texto."); }
      if (sizeLabel) {
        const nums = [...sizeLabel.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]);
        const n = normalizeName(local);
        if (!nums.length || !nums.every((x) => n.includes(normalizeName(x)) || n.includes(x.replace(",", ".")) || n.includes(x.replace(".", ",")))) { sizeLabel = null; flags.push("Tamanho removido: não aparece no texto."); }
      }
      if (unit && !unitWritten(unit, local)) { unit = null; flags.push("Unidade não escrita no texto: informe na revisão."); }
      if (conditions && wordCoverage(conditions, local) < 0.6) { conditions = null; flags.push("Condição removida: não aparece no texto."); }
      if (!lineSrc && src) flags.push("Trecho de origem não localizado no texto: confira a linha inteira.");
    } else {
      // foto/PDF: não há como provar que o valor está lá. Sempre conferir.
      if (price != null || priceFrom != null) flags.push("Preço lido da imagem: confira com a foto antes de salvar.");
      for (const f of CONF_FIELDS) if (confidence[f] === "baixa") {
        const label = { name: "Nome", brand: "Marca", size: "Tamanho", unit: "Unidade", price: "Preço", conditions: "Condições" }[f];
        flags.push(`${label} com leitura incerta: confira.`);
      }
    }

    let regularCents: number | null = price;
    let promoCents: number | null = null;
    if (priceFrom != null && price != null) {
      if (priceFrom > price) { regularCents = priceFrom; promoCents = price; }
      else flags.push("O preço \"de\" não é maior que o preço \"por\". Confira.");
    } else if (priceFrom != null && price == null) {
      regularCents = priceFrom;
      flags.push("Só o preço anterior foi lido. Confira.");
    }
    if (!name) flags.push("Nome do produto não encontrado.");
    if (regularCents == null && promoCents == null) flags.push("Preço não encontrado: informe o preço.");
    if (!unit) flags.push("Unidade não informada: confira (un, kg, L...).");
    return {
      index, sourceText: src, name, brand, sizeLabel, unit, regularCents, promoCents, conditions, category,
      confidence, flags: [...new Set(flags)], priceCheck: sourceType !== "texto",
    };
  });
}

// ---------------- Comparação com o catálogo ----------------
const sizeKey = (s: string | null) => normalizeName(s ?? "").replace(/\s/g, "");

export async function matchCatalog(ctx: TenantCtx, lines: Omit<ExtractedLine, "match">[]): Promise<ExtractedLine[]> {
  const products = await getDb().select({
    id: schema.products.id, name: schema.products.name, normalizedName: schema.products.normalizedName, sizeLabel: schema.products.sizeLabel,
    brand: schema.products.brand, regularCents: schema.products.regularCents, promoCents: schema.products.promoCents,
  }).from(schema.products).where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt)));
  return lines.map((l) => {
    if (!l.name) return { ...l, match: null };
    const n = normalizeName(l.name);
    const sk = sizeKey(l.sizeLabel);
    let best: { p: (typeof products)[number]; score: number } | null = null;
    for (const p of products) {
      const psk = sizeKey(p.sizeLabel);
      if (sk && psk && sk !== psk) continue;
      const score = p.normalizedName === n ? 1 : Math.abs(p.normalizedName.length - n.length) > 8 ? 0 : similarity(p.normalizedName, n);
      if (score >= 0.85 && (!best || score > best.score)) best = { p, score };
    }
    if (!best) return { ...l, match: null };
    const { p } = best;
    return { ...l, match: { productId: p.id, name: p.name, sizeLabel: p.sizeLabel, brand: p.brand, regularCents: p.regularCents, promoCents: p.promoCents, kind: best.score === 1 && sizeKey(p.sizeLabel) === sk ? "igual" : "parecido" } };
  });
}

// ---------------- Extração ----------------
export async function extractList(ctx: TenantCtx, input: { text?: string | null; file?: ExtractFile | null }) {
  requirePermission(ctx, "products.write");
  if (!aiConfig().anthropicKey) throw new AiNotConfiguredError("A extração por IA");
  const text = input.text?.replace(/\r\n?/g, "\n").trim() || null;
  if (!input.file && !text) throw new AppError("validation", "Cole a lista ou envie uma foto/PDF da lista.");
  if (text && text.length > MAX_AI_TEXT) throw new AppError("validation", `Texto longo demais para a IA (máximo ${MAX_AI_TEXT.toLocaleString("pt-BR")} caracteres). Divida a lista em partes.`);

  let sourceType: SourceType = "texto";
  let summary: Record<string, unknown>;
  const content: ClaudeBlock[] = [];
  if (input.file) {
    const f = await prepareFile(input.file);
    sourceType = f.sourceType; summary = f.summary;
    content.push(f.block);
  } else {
    summary = { tipo: "texto", caracteres: text!.length, linhas: text!.split("\n").filter((x) => x.trim()).length };
  }
  const cats = await getDb().selectDistinct({ c: schema.products.category }).from(schema.products)
    .where(and(eq(schema.products.orgId, ctx.orgId), isNull(schema.products.archivedAt), isNotNull(schema.products.category))).limit(60);
  const catLine = cats.length ? `Categorias existentes da loja: ${cats.map((c) => c.c).join("; ")}.` : "A loja ainda não tem categorias cadastradas.";
  if (sourceType === "texto") content.push({ type: "text", text: `${catLine}\n\nLista colada pelo lojista (entre as marcas):\n<<<\n${text}\n>>>` });
  else content.push({ type: "text", text: `${catLine}\n\nExtraia as linhas de produtos ${sourceType === "pdf" ? "deste PDF" : "desta imagem"}.${text ? `\nObservação do lojista: ${text.slice(0, 500)}` : ""}` });

  const cfg = aiConfig();
  const creditKey = sourceType === "texto" ? "extrair_lista_texto" : sourceType === "pdf" ? "extrair_lista_pdf" : "extrair_lista_imagem";
  const run = await runAiRequest(ctx, { kind: "extrair_lista", provider: "anthropic", model: cfg.model, credits: cfg.credits[creditKey], inputSummary: summary }, async () => {
    const r = await claudeJson<ModelOutput>({ system: SYSTEM, content, schema: EXTRACT_SCHEMA });
    const guarded = guardLines(r.data, sourceType, text);
    const lines = await matchCatalog(ctx, guarded);
    const notes = clip(r.data?.notes, 300);
    return { result: { lines, notes }, output: { sourceType, lines, notes }, model: r.model };
  });
  return { requestId: run.requestId, credits: run.credits, sourceType, lines: run.result.lines, notes: run.result.notes, reviewRequired: true as const };
}

// ---------------- Confirmação (depois da revisão humana) ----------------
const cents = z.number().int().min(0).max(100_000_000).nullable();
const commitLine = z.object({
  /** cada linha precisa ser confirmada explicitamente pelo usuário */
  confirmed: z.literal(true, { message: "Confirme cada linha revisada antes de salvar." }),
  action: z.enum(["create", "update"]),
  productId: z.string().nullable().optional(),
  name: z.string().trim().min(1, "Informe o nome do produto.").max(120),
  brand: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  sizeLabel: z.string().trim().max(40).nullable().optional(),
  unit: unitSchema.nullable().optional(),
  regularCents: cents.optional(),
  promoCents: cents.optional(),
  conditions: z.string().trim().max(160).nullable().optional(),
});
const commitSchema = z.object({ requestId: z.string().min(1), lines: z.array(commitLine).min(1, "Selecione pelo menos uma linha.").max(MAX_LINES) });

export async function extractCommit(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "products.write");
  const input = commitSchema.parse(raw);
  const req = await getAiRequest(ctx, input.requestId, "extrair_lista");
  if (req.status === "revisada") throw new AppError("conflict", "Esta extração já foi revisada e salva.");
  if (req.status !== "concluida") throw new AppError("conflict", "Esta extração não pode mais ser salva. Faça uma nova leitura.");
  const db = getDb();
  const result = { created: 0, updated: 0 };
  await db.transaction(async (tx) => {
    for (const l of input.lines) {
      const data = productInputSchema.parse({
        name: l.name, brand: l.brand ?? null, category: l.category ?? null, sizeLabel: l.sizeLabel ?? null, unit: l.unit ?? null,
        regularCents: l.regularCents ?? null, promoCents: l.promoCents ?? null, conditions: l.conditions ?? null,
      });
      if (l.action === "update") {
        if (!l.productId) throw new AppError("validation", `Escolha o produto do catálogo para atualizar "${l.name}".`);
        // atualiza só o que foi revisado e preenchido (campo vazio não apaga dado existente)
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) if (v != null && k !== "name") patch[k] = v;
        await updateProduct(ctx, l.productId, patch, tx);
        result.updated++;
      } else {
        await insertProduct(ctx, data, tx);
        result.created++;
      }
    }
    await tx.update(schema.aiRequests).set({ status: "revisada", reviewedBy: ctx.userId, reviewedAt: new Date() })
      .where(and(eq(schema.aiRequests.id, req.id), eq(schema.aiRequests.orgId, ctx.orgId)));
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "product.ai_extract", entityType: "product", entityId: null,
      summary: `Lista extraída por IA revisada: ${result.created} produto(s) criado(s), ${result.updated} atualizado(s).`, data: { aiRequestId: req.id } });
  });
  return result;
}

export async function extractDiscard(ctx: TenantCtx, requestId: string) {
  requirePermission(ctx, "products.write");
  return markAiRequest(ctx, requestId, "descartada", "extrair_lista");
}
