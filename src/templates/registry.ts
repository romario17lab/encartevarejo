// Registro de modelos (Agente de Design). Versões antigas NUNCA são removidas: uma campanha
// guarda templateId + templateVersion e continua renderizando com a versão que escolheu.
import type { TemplateDefinition } from "./contract";
import feiraDaSemanaV1 from "./feira-da-semana/v1";
import hortifrutiFrescoV1 from "./hortifruti-fresco/v1";
import acougueNaBrasaV1 from "./acougue-na-brasa/v1";
import padariaDoFornoV1 from "./padaria-do-forno/v1";
import geladaNaHoraV1 from "./gelada-na-hora/v1";
import economiaTotalV1 from "./economia-total/v1";
import vitrineCleanV1 from "./vitrine-clean/v1";
import emporioGourmetV1 from "./emporio-gourmet/v1";
import natalEmFamiliaV1 from "./natal-em-familia/v1";
import megaOfertasV1 from "./mega-ofertas/v1";
import atacarejoCaixaV1 from "./atacarejo-caixa/v1";
import casaELimpezaV1 from "./casa-e-limpeza/v1";

/** Todas as versões de todos os modelos (versões antigas NUNCA são removidas). */
export const TEMPLATE_VERSIONS: TemplateDefinition[] = [
  feiraDaSemanaV1,
  hortifrutiFrescoV1,
  acougueNaBrasaV1,
  padariaDoFornoV1,
  geladaNaHoraV1,
  economiaTotalV1,
  vitrineCleanV1,
  emporioGourmetV1,
  natalEmFamiliaV1,
  megaOfertasV1,
  atacarejoCaixaV1,
  casaELimpezaV1,
];

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
