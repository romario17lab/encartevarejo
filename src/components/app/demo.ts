// Campanha de DEMONSTRAÇÃO para prévias (galeria de modelos, identidade visual).
// Sempre isDemo=true: os modelos exibem a marca d'água "DADOS DE DEMONSTRAÇÃO".
import type { RenderBrand, RenderCampaign } from "@/domain/campaign";
import { demoCampaign as baseDemo } from "@/templates/demo-data";

/** Demonstração do Design, opcionalmente com a identidade da loja (nome, logo, cores, contatos). */
export function demoCampaign(n = 6, brand?: Partial<RenderBrand>): RenderCampaign {
  const base = baseDemo(n);
  if (!brand) return base;
  const clean = Object.fromEntries(Object.entries(brand).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<RenderBrand>;
  return { ...base, isDemo: true, brand: { ...base.brand, ...clean, colors: { ...base.brand.colors, ...(brand.colors ?? {}) } } };
}
