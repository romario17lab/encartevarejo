// STUB do coordenador — o Agente de Design preenche com os modelos, mantendo estas assinaturas.
import type { TemplateDefinition } from "./contract";

/** Todas as versões de todos os modelos (versões antigas NUNCA são removidas). */
export const TEMPLATE_VERSIONS: TemplateDefinition[] = [];

export function getTemplate(id: string, version?: number): TemplateDefinition | undefined {
  const all = TEMPLATE_VERSIONS.filter((t) => t.id === id);
  if (version !== undefined) return all.find((t) => t.version === version);
  return all.sort((a, b) => b.version - a.version)[0];
}

export function latestVersion(id: string): number | undefined {
  return getTemplate(id)?.version;
}

/** Última versão de cada modelo. */
export function listTemplates(): TemplateDefinition[] {
  const ids = [...new Set(TEMPLATE_VERSIONS.map((t) => t.id))];
  return ids.map((id) => getTemplate(id)!).filter(Boolean);
}

export const DEFAULT_TEMPLATE_ID = "feira-da-semana";
