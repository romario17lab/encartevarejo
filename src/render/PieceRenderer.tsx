// Renderizador de peças: o MESMO componente na prévia do editor e na exportação (Chromium).
// Sem importações exclusivas de servidor: pode ser usado em componentes de cliente.
import type { CSSProperties, ReactElement } from "react";
import { FORMATS, type FormatId, type FormatSpec } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { LayoutResult, TemplateDefinition } from "@/templates/contract";
import { getTemplate } from "@/templates/registry";
import { layoutPiece } from "@/layout/engine";
import { mergeColors } from "./colors";
import { offersFingerprint } from "./fingerprint";

export type TemplateRef = TemplateDefinition | { id: string; version?: number };

export interface PieceRendererProps {
  campaign: RenderCampaign;
  /** definição do modelo ou referência (id + versão) resolvida pelo registro */
  template: TemplateRef;
  format: FormatSpec | FormatId;
  overrides?: PieceOverrides;
  /** número da página (0..n-1) ou "all" para todas empilhadas (PDF). Padrão: 0 */
  pageIndex?: number | "all";
  /** layout já calculado (evita recalcular quando o chamador também precisa dos avisos) */
  layout?: LayoutResult;
  /** sangria em px CSS em cada lado (PDF com sangria): bordas da página estendidas além do corte */
  bleedPx?: number;
  /** espaço visual entre páginas empilhadas (somente prévia; 0 na exportação) */
  stackGap?: number;
  className?: string;
  style?: CSSProperties;
}

export function resolveTemplate(ref: TemplateRef): TemplateDefinition | undefined {
  return "renderPage" in ref ? ref : getTemplate(ref.id, ref.version);
}

export function resolveFormat(f: FormatSpec | FormatId): FormatSpec | undefined {
  return typeof f === "string" ? FORMATS[f] : f;
}

/** Aplica título/subtítulo personalizados da peça sobre os dados da campanha. */
export function applyTextOverrides(campaign: RenderCampaign, overrides: PieceOverrides): RenderCampaign {
  if (!overrides.title && overrides.subtitle === undefined) return campaign;
  return { ...campaign, title: overrides.title || campaign.title, subtitle: overrides.subtitle !== undefined ? overrides.subtitle || null : campaign.subtitle };
}

/** Calcula o layout de uma peça (atalho usado pelo editor para mostrar avisos e contar páginas). */
export function computePieceLayout(campaign: RenderCampaign, template: TemplateRef, format: FormatSpec | FormatId, overrides: PieceOverrides = {}): LayoutResult | null {
  const t = resolveTemplate(template);
  const f = resolveFormat(format);
  if (!t || !f) return null;
  return layoutPiece({ campaign: applyTextOverrides(campaign, overrides), format: f, template: t, overrides });
}

function Problem({ format, text }: { format?: FormatSpec; text: string }) {
  return (
    <div data-ev-render-error="" role="alert" style={{ width: format?.widthPx ?? 600, height: format?.heightPx ?? 400, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff4f4", color: "#7f1d1d", fontFamily: "Inter, system-ui, sans-serif", fontSize: 24, padding: 32, textAlign: "center", boxSizing: "border-box" }}>
      {text}
    </div>
  );
}

export function PieceRenderer(props: PieceRendererProps): ReactElement {
  const { pageIndex = 0, bleedPx = 0, stackGap = 0, className, style } = props;
  const overrides = props.overrides ?? {};
  const format = resolveFormat(props.format);
  const template = resolveTemplate(props.template);
  if (!format) return <Problem text="Formato de peça desconhecido." />;
  if (!template) return <Problem format={format} text="Modelo não encontrado. Escolha outro modelo para a campanha." />;

  const campaign = applyTextOverrides(props.campaign, overrides);
  const layout = props.layout ?? layoutPiece({ campaign, format, template, overrides });
  const colors = mergeColors(template, campaign.brand.colors, overrides.colors);
  const pages = pageIndex === "all" ? layout.pages : layout.pages.filter((p) => p.pageIndex === pageIndex);
  if (!pages.length) return <Problem format={format} text={`Esta peça tem ${layout.pages.length} página(s); a página pedida não existe.`} />;

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: stackGap, width: format.widthPx + 2 * bleedPx, ...style }}
      data-ev-render=""
      data-ev-format={format.id}
      data-ev-template={`${template.id}@${template.version}`}
      data-ev-version={campaign.version}
      data-ev-offers={offersFingerprint(props.campaign.items)}
      data-ev-pages={layout.pages.length}
    >
      {pages.map((page, i) => (
        <div
          key={page.pageIndex}
          data-ev-page-wrap={page.pageIndex}
          style={{
            position: "relative", width: format.widthPx + 2 * bleedPx, height: format.heightPx + 2 * bleedPx, padding: bleedPx,
            boxSizing: "border-box", background: bleedPx ? colors.background : undefined, flex: "none",
            breakAfter: i < pages.length - 1 ? "page" : "auto", breakInside: "avoid", overflow: "hidden",
          }}
        >
          {bleedPx > 0 && (
            // Sangria: cópia da página ampliada por trás, para as bordas (fundos, faixas) continuarem além do corte.
            <div aria-hidden="true" data-ev-bleed="" style={{
              position: "absolute", left: 0, top: 0, width: format.widthPx, height: format.heightPx, overflow: "hidden",
              transform: `scale(${(format.widthPx + 2 * bleedPx) / format.widthPx}, ${(format.heightPx + 2 * bleedPx) / format.heightPx})`, transformOrigin: "0 0",
            }}>
              {template.renderPage({ campaign, page, format, overrides, colors })}
            </div>
          )}
          <div data-ev-page={page.pageIndex} style={{ position: "relative", width: format.widthPx, height: format.heightPx, overflow: "hidden" }}>
            {template.renderPage({ campaign, page, format, overrides, colors })}
          </div>
        </div>
      ))}
    </div>
  );
}

export { ScaledPreview, useOverflowCheck } from "./ScaledPreview";
