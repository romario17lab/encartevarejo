import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { TemplateDefinition } from "@/templates/contract";

export type Palette = RenderCampaign["brand"]["colors"];

const isColor = (v: unknown): v is string => typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/.test(v.trim());

/** Cores finais: paleta do modelo → cores da loja (se o modelo usa as cores da marca) → personalização da peça. */
export function mergeColors(template: Pick<TemplateDefinition, "palette" | "useBrandColors">, brand: Partial<Palette> | null | undefined, overrides?: PieceOverrides["colors"]): Palette {
  const out: Palette = { ...template.palette };
  const apply = (src: Partial<Palette> | null | undefined) => {
    if (!src) return;
    for (const k of Object.keys(out) as Array<keyof Palette>) if (isColor(src[k])) out[k] = src[k]!.trim();
  };
  if (template.useBrandColors) apply(brand);
  apply(overrides);
  return out;
}
