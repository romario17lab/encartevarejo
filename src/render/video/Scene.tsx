// Cena animada do vídeo de ofertas. Reaproveita o visual do modelo da campanha (fundo em camadas,
// cabeçalho com logo e título, cards com etiqueta de preço e rodapé — os MESMOS componentes das
// peças) e organiza tudo em camadas que o runtime (runtime.ts) anima quadro a quadro.
// Componente sem estado e sem APIs de navegador: renderiza igual no Next (prévia) e no worker
// (renderToStaticMarkup), o que garante prévia = vídeo gerado.
import type { CSSProperties, ReactElement } from "react";
import { FORMATS, type FormatSpec } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { PageLayout, Rect, TemplateDefinition } from "@/templates/contract";
import { layoutPiece } from "@/layout/engine";
import { applyTextOverrides } from "@/render/PieceRenderer";
import { mergeColors, type Palette } from "@/render/colors";
import { offersFingerprint } from "@/render/fingerprint";
import { DemoWatermark } from "@/templates/parts/Extras";
import { ensureContrast, mix } from "@/templates/parts/color";
import { contacts3, STOCK_NOTE } from "@/templates/parts3/Footer3";
import { fitLines, fontStack } from "@/templates/parts2/measure";
import { ORIENTATIONS } from "./options";
import type { VideoPlan } from "./plan";
import { buildTimeline } from "./timeline";
import { RUNTIME_JS } from "./runtime";

export interface VideoSceneProps {
  campaign: RenderCampaign;
  template: TemplateDefinition;
  overrides?: PieceOverrides;
  plan: VideoPlan;
  /** prévia no editor: toca sozinha em tempo real e se ajusta à janela */
  preview?: boolean;
  autoplay?: boolean;
}

const ZERO = (W: number, y: number): Rect => ({ x: 0, y, w: W, h: 0 });
/** JSON seguro dentro de <script> (nomes de produtos são texto do usuário). */
export const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function page(format: FormatSpec, p: Partial<PageLayout>): PageLayout {
  const W = format.widthPx, H = format.heightPx;
  return {
    pageIndex: 0, totalPages: 1, header: ZERO(W, 0), footer: ZERO(W, H), body: { x: 0, y: 0, w: W, h: H },
    cells: [], sections: [], variant: "single", ...p,
  };
}

/** Encerramento: validade, contatos da loja (o que falta some), "Imagens ilustrativas" e texto legal. */
function Outro({ campaign, colors, template, area, vertical }: { campaign: RenderCampaign; colors: Palette; template: TemplateDefinition; area: Rect; vertical: boolean }) {
  const bg = colors.primary;
  const fg = ensureContrast("#ffffff", bg, 7);
  const chipBg = colors.secondary;
  const chipFg = ensureContrast(colors.text, chipBg, 4.5);
  const icon = ensureContrast(colors.accent, bg, 3);
  const pad = vertical ? 64 : 72;
  const innerW = area.w - pad * 2;
  const display = { family: template.fonts.display, weight: 800 };
  const validity = campaign.validityText.trim();
  const vFit = fitLines(validity.toLocaleUpperCase("pt-BR"), display, innerW, area.h * 0.36, { maxFs: vertical ? 84 : 78, minFs: 30, maxLines: 4, lineHeight: 1.08 });
  const contacts = contacts3(campaign);
  const cFs = vertical ? (contacts.length > 4 ? 36 : 42) : (contacts.length > 4 ? 32 : 38);
  const stock = /estoque/i.test(validity) ? null : STOCK_NOTE;
  const legal = campaign.legalText?.trim() || null;
  const illustrative = legal && /ilustrativ/i.test(legal) ? null : "Imagens ilustrativas.";
  const small = [illustrative, stock ? `${stock}.` : null, legal].filter(Boolean).join(" ");
  const row: CSSProperties = { width: "100%", display: "flex", justifyContent: "center" };
  return (
    <div data-v-outro="" style={{ position: "absolute", left: area.x, top: area.y, width: area.w, height: area.h, boxSizing: "border-box", padding: pad, background: `linear-gradient(160deg, ${mix(bg, "#ffffff", 0.08)}, ${mix(bg, "#000000", 0.18)})`, color: fg, borderRadius: vertical ? 48 : 40, boxShadow: "0 18px 0 rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: vertical ? 40 : 28, textAlign: "center", fontFamily: fontStack(template.fonts.body) }}>
      <div data-v-row="" style={row}>
        <span style={{ background: chipBg, color: chipFg, fontFamily: fontStack("Inter"), fontWeight: 900, fontSize: vertical ? 34 : 30, letterSpacing: "0.08em", padding: "10px 26px", borderRadius: 999 }}>VALIDADE</span>
      </div>
      <div data-v-row="" data-ev-validity="" style={{ ...row, fontFamily: fontStack(display.family), fontWeight: display.weight, fontSize: vFit.fs, lineHeight: 1.08, textTransform: "uppercase", overflowWrap: "anywhere" }}>{validity}</div>
      {contacts.length > 0 && (
        <div data-v-row="" style={{ ...row, flexDirection: "column", alignItems: "center", gap: cFs * 0.45 }}>
          {contacts.map((c) => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: cFs * 0.4, fontSize: cFs, fontWeight: 700, lineHeight: 1.2, maxWidth: innerW }}>
              <c.Icon size={Math.round(cFs * 1.15)} color={icon} />
              <span style={{ overflowWrap: "anywhere" }}>{c.text}</span>
            </div>
          ))}
        </div>
      )}
      <div data-v-row="" style={{ ...row, fontFamily: fontStack(display.family), fontWeight: display.weight, fontSize: vertical ? 54 : 50, lineHeight: 1.1 }}>{campaign.brand.storeName}</div>
      <div data-v-row="" data-ev-legal="" style={{ ...row, fontSize: vertical ? 28 : 26, fontWeight: 600, lineHeight: 1.3, opacity: 0.95, maxWidth: innerW }}>{small}</div>
    </div>
  );
}

export function VideoScene(props: VideoSceneProps): ReactElement {
  const { template, plan } = props;
  const format = FORMATS[ORIENTATIONS[plan.orientation].format];
  const W = format.widthPx, H = format.heightPx;
  const vertical = plan.orientation === "vertical";
  const overrides: PieceOverrides = { ...(props.overrides ?? {}), showCategoryHeaders: false, order: "manual", hiddenItemIds: [] };
  const campaign = applyTextOverrides(props.campaign, overrides);
  const colors = mergeColors(template, campaign.brand.colors, overrides.colors);
  const byId = new Map(campaign.items.map((i) => [i.id, i]));
  const render = (p: PageLayout) => template.renderPage({ campaign, page: p, format, overrides, colors });

  // moldura (cabeçalho/corpo/rodapé) do modelo para este formato: a mesma da peça de 1 tela
  const frameItems = campaign.items.slice(0, 1);
  const frame = layoutPiece({ campaign: { ...campaign, items: frameItems }, format, template, overrides: { ...overrides, itemsPerPage: 1 } }).pages[0];
  const header = frame?.header ?? { x: 0, y: 0, w: W, h: Math.round(H * 0.2) };
  const footer = frame?.footer ?? { x: 0, y: Math.round(H * 0.87), w: W, h: Math.round(H * 0.13) };
  const introHeader: Rect = { x: 0, y: 0, w: W, h: Math.round(H * (vertical ? 0.4 : 0.52)) };

  const productScenes = plan.scenes.filter((s) => s.kind === "products");
  const sceneLayers = productScenes.map((s) => {
    const items = s.itemIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
    const res = layoutPiece({ campaign: { ...campaign, items }, format, template, overrides: { ...overrides, itemsPerPage: Math.max(1, items.length) } });
    const cells = res.pages.flatMap((p) => (p.pageIndex === 0 ? p.cells : []));
    return { key: s.key, page: page(format, { cells, body: res.pages[0]?.body ?? frame?.body }) };
  });

  const timeline = buildTimeline(plan);
  const data = { ...timeline, preview: !!props.preview, autoplay: props.autoplay !== false, loop: true };
  const outroGap = vertical ? 40 : 36;
  const outroArea: Rect = { x: outroGap, y: header.y + header.h + outroGap * 0.6, w: W - outroGap * 2, h: H - (header.y + header.h) - outroGap * (vertical ? 3.2 : 1.6) };
  const layer: CSSProperties = { position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden" };
  const bgBase = colors.background;

  return (
    <div data-v-stage="" data-ev-render="" data-ev-version={campaign.version} data-ev-offers={offersFingerprint(props.campaign.items)} data-ev-template={`${template.id}@${template.version}`}
      data-v-duration={plan.durationSec} style={{ position: "relative", width: W, height: H, overflow: "hidden", background: bgBase }}>
      <style>{`
        [data-v-layer]:not([data-v-el="bg"]) [data-ev-ground],[data-v-layer]:not([data-v-el="bg"]) [data-ev-depth],[data-v-layer] [data-ev-demo]{display:none!important}
        [data-v-layer]:not([data-v-el="bg"]) [data-ev-root]{background:transparent!important}
        [data-v-layer]{will-change:transform,opacity}
      `}</style>
      <div data-v-layer="" data-v-el="bg" style={layer}>{render(page(format, {}))}</div>
      <div data-v-layer="" data-v-el="intro" style={{ ...layer, top: vertical ? Math.round(H * 0.17) : Math.round(H * 0.2) }}>{render(page(format, { header: introHeader }))}</div>
      {sceneLayers.map((s) => <div key={s.key} data-v-layer="" data-v-el={s.key} style={layer}>{render(s.page)}</div>)}
      <div data-v-layer="" data-v-el="header" style={layer}>{render(page(format, { header }))}</div>
      <div data-v-layer="" data-v-el="footer" style={layer}>{render(page(format, { footer }))}</div>
      <div data-v-layer="" data-v-el="outro" style={layer}><Outro campaign={campaign} colors={colors} template={template} area={outroArea} vertical={vertical} /></div>
      {campaign.isDemo && <div data-v-demo="" style={{ ...layer, pointerEvents: "none" }}><DemoWatermark w={W} h={H} /></div>}
      <script id="ev-video-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson(data) }} />
      <script dangerouslySetInnerHTML={{ __html: RUNTIME_JS }} />
    </div>
  );
}
