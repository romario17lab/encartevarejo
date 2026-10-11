// Publicação de modelos para os clientes. O código dos modelos fica em src/templates (registro com
// TODAS as versões); a administração controla, no banco:
//   - template_releases: versão publicada ou não (sem linha = publicada, compatível com bases antigas)
//   - template_settings: categoria, ativo na galeria e ordem (sem linha = ativo, sem categoria, ordem 0)
// Regras:
//   - galeria e campanhas NOVAS usam a ÚLTIMA versão PUBLICADA de modelos ATIVOS;
//   - campanhas existentes NUNCA são alteradas: continuam na versão fixada (mesmo despublicada);
//   - migração só acontece por ação explícita do usuário no editor, sempre para uma versão publicada.
import { TEMPLATE_VERSIONS, DEFAULT_TEMPLATE_ID, getTemplate } from "@/templates/registry";
import type { TemplateDefinition } from "@/templates/contract";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError } from "../errors";
import { templateInfo } from "./campaign-state";

export interface TemplateControls {
  /** chave `${id}@${version}` → publicada? (ausente = publicada) */
  releases: Map<string, { isPublished: boolean; publishedAt: Date; notes: string | null }>;
  settings: Map<string, { category: string | null; isActive: boolean; sortOrder: number }>;
}

export async function loadTemplateControls(db: Executor = getDb()): Promise<TemplateControls> {
  const [rel, set] = await Promise.all([
    db.select().from(schema.templateReleases),
    db.select().from(schema.templateSettings),
  ]);
  return {
    releases: new Map(rel.map((r) => [`${r.templateId}@${r.version}`, { isPublished: r.isPublished, publishedAt: r.publishedAt, notes: r.notes }])),
    settings: new Map(set.map((s) => [s.templateId, { category: s.category, isActive: s.isActive, sortOrder: s.sortOrder }])),
  };
}

export const isVersionPublished = (c: TemplateControls, id: string, version: number) => c.releases.get(`${id}@${version}`)?.isPublished ?? true;
export const templateSettingsOf = (c: TemplateControls, id: string) => c.settings.get(id) ?? { category: null, isActive: true, sortOrder: 0 };

/** Ids na ordem do registro (primeira aparição). */
export function registryTemplateIds(): string[] {
  return [...new Set(TEMPLATE_VERSIONS.map((t) => t.id))];
}

/** Versões registradas de um modelo, da mais nova para a mais antiga. */
export function registryVersions(id: string): TemplateDefinition[] {
  return TEMPLATE_VERSIONS.filter((t) => t.id === id).sort((a, b) => b.version - a.version);
}

/** Última versão PUBLICADA (independe de o modelo estar ativo na galeria). */
export function latestPublishedOf(c: TemplateControls, id: string): TemplateDefinition | undefined {
  return registryVersions(id).find((t) => isVersionPublished(c, id, t.version));
}

export async function latestPublishedVersion(id: string, db: Executor = getDb()): Promise<number | undefined> {
  return latestPublishedOf(await loadTemplateControls(db), id)?.version;
}

/** Modelos oferecidos aos clientes: ativos, com ao menos uma versão publicada, na ordem definida pela administração. */
export async function listPublishedTemplates(db: Executor = getDb()) {
  const c = await loadTemplateControls(db);
  const ids = registryTemplateIds();
  const out = ids.map((id, idx) => {
    const s = templateSettingsOf(c, id);
    const t = s.isActive ? latestPublishedOf(c, id) : undefined;
    return t ? { t, s, idx } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  out.sort((a, b) => a.s.sortOrder - b.s.sortOrder || a.idx - b.idx);
  return out.map(({ t, s }) => ({
    id: t.id, version: t.version, latestVersion: t.version, name: t.name, description: t.description, segments: t.segments, style: t.style,
    category: s.category, palette: t.palette, useBrandColors: t.useBrandColors, fonts: t.fonts, supportedFormats: t.supportedFormats,
    thumbnailFormat: t.thumbnailFormat ?? null,
    versions: registryVersions(t.id).filter((v) => isVersionPublished(c, t.id, v.version)).map((v) => v.version),
  }));
}

/**
 * Modelo e versão para uma campanha NOVA. Sem templateId: o modelo padrão se estiver disponível, senão o primeiro da galeria.
 * Modelo inativo ou sem versão publicada → erro de validação.
 */
export async function resolveTemplateForNewCampaign(templateId?: string | null, db: Executor = getDb()): Promise<{ id: string; version: number }> {
  if (!TEMPLATE_VERSIONS.length) return { id: templateId ?? DEFAULT_TEMPLATE_ID, version: 1 };
  const c = await loadTemplateControls(db);
  const available = (id: string) => (templateSettingsOf(c, id).isActive ? latestPublishedOf(c, id) : undefined);
  if (templateId) {
    if (!getTemplate(templateId)) throw new AppError("validation", "Modelo não encontrado.");
    const t = available(templateId);
    if (!t) throw new AppError("validation", "Este modelo não está disponível para novas campanhas. Escolha outro modelo.");
    return { id: t.id, version: t.version };
  }
  const def = available(DEFAULT_TEMPLATE_ID);
  if (def) return { id: def.id, version: def.version };
  const first = (await listPublishedTemplates(db))[0];
  if (!first) throw new AppError("validation", "Nenhum modelo está disponível no momento. Tente novamente mais tarde.");
  return { id: first.id, version: first.version };
}

/**
 * Troca de modelo/migração pedida pelo usuário (ação explícita no editor).
 * - Mesmo modelo e mesma versão da campanha: permitido (nada muda, mesmo se a versão foi despublicada).
 * - Outra versão: precisa estar publicada. Sem versão: última publicada.
 * - Outro modelo: precisa estar ativo na galeria.
 */
export async function resolveTemplateForSwitch(
  input: { templateId: string; templateVersion?: number | null },
  current: { templateId: string; templateVersion: number },
  db: Executor = getDb(),
): Promise<{ id: string; version: number }> {
  if (!TEMPLATE_VERSIONS.length) return { id: input.templateId, version: input.templateVersion ?? 1 };
  if (input.templateId === current.templateId && input.templateVersion === current.templateVersion) return { id: current.templateId, version: current.templateVersion };
  const c = await loadTemplateControls(db);
  if (!getTemplate(input.templateId)) throw new AppError("validation", "Modelo não encontrado.");
  if (input.templateId !== current.templateId && !templateSettingsOf(c, input.templateId).isActive)
    throw new AppError("validation", "Este modelo não está disponível. Escolha outro modelo.");
  if (input.templateVersion != null) {
    if (!getTemplate(input.templateId, input.templateVersion)) throw new AppError("validation", `Versão ${input.templateVersion} do modelo não encontrada.`);
    if (!isVersionPublished(c, input.templateId, input.templateVersion))
      throw new AppError("validation", `A versão ${input.templateVersion} deste modelo não está publicada. Escolha a versão mais recente.`);
    return { id: input.templateId, version: input.templateVersion };
  }
  const t = latestPublishedOf(c, input.templateId);
  if (!t) throw new AppError("validation", "Este modelo não tem versão publicada no momento.");
  return { id: t.id, version: t.version };
}

/** Informação do modelo para o editor: `latestVersion` é a última versão PUBLICADA mais nova que a fixada (ou a própria). */
export async function editorTemplateInfo(id: string, version: number, db: Executor = getDb()) {
  const info = templateInfo(id, version);
  const latest = TEMPLATE_VERSIONS.length ? await latestPublishedVersion(id, db) : undefined;
  return { ...info, latestVersion: latest && latest > version ? latest : version };
}
