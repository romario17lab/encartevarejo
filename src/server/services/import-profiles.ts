import "../zod-pt";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { and, eq, sql } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { writeAudit } from "../audit";
import { requirePermission } from "../tenant";
import { storage } from "../storage";
import { IMPORT_FIELDS, importCommit, importPreview, type ImportField } from "./product-import";

// Perfis de importação: mapeamentos de colunas salvos para reimportar, toda semana, a mesma exportação do
// sistema de gestão (ERP) em um passo. Guardados em organizations.settings.importProfiles (jsonb), sem tabela nova.
// A importação manual (escolher colunas a cada vez) continua funcionando igual.

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
export const MAX_PROFILES = 20;

export interface ImportProfile {
  id: string;
  name: string;
  /** campo → nome exato da coluna na planilha */
  mapping: Partial<Record<ImportField, string>>;
  onDuplicate: "skip" | "update" | "create";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastUsedAt?: string | null;
}

type SettingsWithProfiles = { importProfiles?: ImportProfile[] } & Record<string, unknown>;

/**
 * Leiautes de exemplo de exportações genéricas de sistemas de gestão. São apenas pontos de partida:
 * NÃO representam suporte oficial a nenhum fornecedor. Os nomes das colunas devem ser conferidos na planilha real.
 */
export const EXAMPLE_LAYOUTS: Array<{ key: string; name: string; description: string; columns: string[]; mapping: Partial<Record<ImportField, string>>; onDuplicate: ImportProfile["onDuplicate"] }> = [
  {
    key: "erp_basico_ponto_virgula",
    name: "Exemplo A — cadastro com preço de venda (CSV com ;)",
    description: "Exportação de cadastro com código de barras, descrição, unidade e preço de venda; preço promocional em coluna separada.",
    columns: ["EAN", "Descricao", "Unidade", "Preco Venda", "Preco Promocao"],
    mapping: { barcode: "EAN", name: "Descricao", unit: "Unidade", regularCents: "Preco Venda", promoCents: "Preco Promocao" },
    onDuplicate: "update",
  },
  {
    key: "erp_completo",
    name: "Exemplo B — cadastro completo com seção e marca",
    description: "Exportação com seção (departamento), marca, embalagem e custo (o custo fica privado).",
    columns: ["Cod Barras", "Produto", "Marca", "Secao", "Embalagem", "Un", "Preco", "Oferta", "Custo"],
    mapping: { barcode: "Cod Barras", name: "Produto", brand: "Marca", category: "Secao", sizeLabel: "Embalagem", unit: "Un", regularCents: "Preco", promoCents: "Oferta", costCents: "Custo" },
    onDuplicate: "update",
  },
  {
    key: "lista_precos_simples",
    name: "Exemplo C — lista de preços da semana",
    description: "Planilha simples de ofertas: GTIN, nome e preço por (promoção). Produtos já cadastrados têm o preço atualizado.",
    columns: ["GTIN", "Nome", "Preco Por"],
    mapping: { barcode: "GTIN", name: "Nome", promoCents: "Preco Por" },
    onDuplicate: "update",
  },
];

const mappingSchema = z.record(z.string(), z.string().trim().max(120).nullable().optional())
  .transform((m, ctx) => {
    const out: Partial<Record<ImportField, string>> = {};
    for (const [k, v] of Object.entries(m)) {
      if (!v) continue;
      if (!(IMPORT_FIELDS as readonly string[]).includes(k)) { ctx.addIssue({ code: "custom", message: `Campo desconhecido no mapeamento: ${k}.` }); return z.NEVER; }
      out[k as ImportField] = v;
    }
    if (!out.name) { ctx.addIssue({ code: "custom", message: "O perfil precisa da coluna com o nome do produto.", path: ["name"] }); return z.NEVER; }
    const cols = Object.values(out);
    if (new Set(cols).size !== cols.length) { ctx.addIssue({ code: "custom", message: "A mesma coluna foi usada em mais de um campo." }); return z.NEVER; }
    return out;
  });

export const profileInputSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome ao perfil (ex.: Exportação semanal do sistema).").max(60),
  mapping: mappingSchema,
  onDuplicate: z.enum(["skip", "update", "create"]).default("update"),
});

async function readProfiles(orgId: string, db = getDb()): Promise<ImportProfile[]> {
  const [org] = await db.select({ settings: schema.organizations.settings }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  const list = (org?.settings as SettingsWithProfiles | undefined)?.importProfiles;
  return Array.isArray(list) ? list : [];
}

/** Grava a lista sem tocar nas outras chaves de settings (jsonb_set), dentro de transação com a linha travada. */
async function mutateProfiles<T>(ctx: TenantCtx, fn: (list: ImportProfile[]) => { list: ImportProfile[]; result: T }): Promise<T> {
  return getDb().transaction(async (tx) => {
    const [org] = await tx.select({ settings: schema.organizations.settings }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).for("update");
    if (!org) throw notFound("Conta");
    const cur = (org.settings as SettingsWithProfiles).importProfiles;
    const { list, result } = fn(Array.isArray(cur) ? cur : []);
    await tx.update(schema.organizations)
      .set({ settings: sql`jsonb_set(coalesce(${schema.organizations.settings}, '{}'::jsonb), '{importProfiles}', ${JSON.stringify(list)}::jsonb, true)` })
      .where(eq(schema.organizations.id, ctx.orgId));
    return result;
  });
}

export async function listImportProfiles(ctx: TenantCtx) {
  requirePermission(ctx, "products.read");
  return { profiles: await readProfiles(ctx.orgId), examples: EXAMPLE_LAYOUTS };
}

export async function createImportProfile(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "products.write");
  const input = profileInputSchema.parse(raw);
  const now = new Date().toISOString();
  const profile = await mutateProfiles(ctx, (list) => {
    if (list.length >= MAX_PROFILES) throw new AppError("limit_reached", `Limite de ${MAX_PROFILES} perfis de importação. Exclua um perfil antigo.`);
    if (list.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) throw new AppError("conflict", "Já existe um perfil com este nome.");
    const p: ImportProfile = { id: `imp_${nano()}`, name: input.name, mapping: input.mapping, onDuplicate: input.onDuplicate, createdAt: now, updatedAt: now, createdBy: ctx.userId, lastUsedAt: null };
    return { list: [...list, p], result: p };
  });
  await writeAudit(getDb(), { orgId: ctx.orgId, userId: ctx.userId, action: "product.import_profile_create", entityType: "import_profile", entityId: profile.id, summary: `Perfil de importação "${profile.name}" salvo.` });
  return profile;
}

export async function updateImportProfile(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "products.write");
  const input = profileInputSchema.partial().parse(raw);
  const profile = await mutateProfiles(ctx, (list) => {
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) throw notFound("Perfil de importação");
    if (input.name && list.some((p) => p.id !== id && p.name.toLowerCase() === input.name!.toLowerCase())) throw new AppError("conflict", "Já existe um perfil com este nome.");
    const p: ImportProfile = { ...list[i]!, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), updatedAt: new Date().toISOString() };
    const next = [...list]; next[i] = p;
    return { list: next, result: p };
  });
  await writeAudit(getDb(), { orgId: ctx.orgId, userId: ctx.userId, action: "product.import_profile_update", entityType: "import_profile", entityId: id, summary: `Perfil de importação "${profile.name}" atualizado.` });
  return profile;
}

export async function deleteImportProfile(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "products.write");
  const removed = await mutateProfiles(ctx, (list) => {
    const p = list.find((x) => x.id === id);
    if (!p) throw notFound("Perfil de importação");
    return { list: list.filter((x) => x.id !== id), result: p };
  });
  await writeAudit(getDb(), { orgId: ctx.orgId, userId: ctx.userId, action: "product.import_profile_delete", entityType: "import_profile", entityId: id, summary: `Perfil de importação "${removed.name}" excluído.` });
  return { ok: true };
}

/**
 * Importação em um passo com um perfil salvo: lê o arquivo, confere se TODAS as colunas do perfil existem
 * (senão nada é importado e as colunas faltantes são informadas) e importa com o mapeamento e a regra de duplicados do perfil.
 */
export async function runImportProfile(ctx: TenantCtx, id: string, file: { data: Buffer; name: string }) {
  requirePermission(ctx, "products.write");
  const profile = (await readProfiles(ctx.orgId)).find((p) => p.id === id);
  if (!profile) throw notFound("Perfil de importação");
  const preview = await importPreview(ctx, file);
  const missing = Object.values(profile.mapping).filter((c) => c && !preview.columns.includes(c));
  if (missing.length) {
    // nada é importado: descarta o arquivo temporário
    const [a] = await getDb().select().from(schema.assets).where(and(eq(schema.assets.id, preview.importId), eq(schema.assets.orgId, ctx.orgId)));
    if (a) { await storage.delete(a.storageKey).catch(() => undefined); await getDb().delete(schema.assets).where(eq(schema.assets.id, a.id)); }
    throw new AppError("validation", `A planilha não tem as colunas do perfil "${profile.name}": ${missing.join(", ")}. Confira se é o mesmo leiaute ou importe escolhendo as colunas.`,
      { missingColumns: missing, columns: preview.columns });
  }
  const result = await importCommit(ctx, { importId: preview.importId, mapping: profile.mapping, options: { onDuplicate: profile.onDuplicate } });
  await mutateProfiles(ctx, (list) => ({ list: list.map((p) => (p.id === id ? { ...p, lastUsedAt: new Date().toISOString() } : p)), result: null }));
  return { profile: { id: profile.id, name: profile.name }, totalRows: preview.totalRows, ...result };
}
