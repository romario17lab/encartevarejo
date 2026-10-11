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
// v2: mesmo id, visual de alto impacto (parts2). A v1 continua registrada para campanhas antigas.
import feiraDaSemanaV2 from "./feira-da-semana/v2";
import hortifrutiFrescoV2 from "./hortifruti-fresco/v2";
import acougueNaBrasaV2 from "./acougue-na-brasa/v2";
import padariaDoFornoV2 from "./padaria-do-forno/v2";
import geladaNaHoraV2 from "./gelada-na-hora/v2";
import economiaTotalV2 from "./economia-total/v2";
import vitrineCleanV2 from "./vitrine-clean/v2";
import emporioGourmetV2 from "./emporio-gourmet/v2";
import natalEmFamiliaV2 from "./natal-em-familia/v2";
import megaOfertasV2 from "./mega-ofertas/v2";
import atacarejoCaixaV2 from "./atacarejo-caixa/v2";
import casaELimpezaV2 from "./casa-e-limpeza/v2";

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
  feiraDaSemanaV2,
  hortifrutiFrescoV2,
  acougueNaBrasaV2,
  padariaDoFornoV2,
  geladaNaHoraV2,
  economiaTotalV2,
  vitrineCleanV2,
  emporioGourmetV2,
  natalEmFamiliaV2,
  megaOfertasV2,
  atacarejoCaixaV2,
  casaELimpezaV2,
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
