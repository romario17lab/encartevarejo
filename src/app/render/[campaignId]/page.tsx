// Página de renderização aberta pelo Chromium headless na exportação.
// Não usa sessão: o acesso é por token assinado { cid, org, v } com validade curta.
// Renderiza EXATAMENTE a versão da campanha indicada no token.
import { FORMATS, type FormatId } from "@/domain/formats";
import { getTemplate } from "@/templates/registry";
import { PieceRenderer } from "@/render/PieceRenderer";
import { verifyRenderToken } from "@/server/export/render-token";
import { effectiveOverrides, loadRenderBundle } from "@/server/services/render-data";
import { AppError } from "@/server/errors";
import { mergeColors } from "@/render/colors";
import { ReadySignal } from "../ReadySignal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const BLEED_PX = (3 * 96) / 25.4; // 3 mm em px CSS

function RenderError({ message }: { message: string }) {
  return (
    <main data-ev-render-error={message} style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 32, color: "#7f1d1d" }}>
      <p>{message}</p>
      <ReadySignal />
    </main>
  );
}

export default async function RenderPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<SP> }) {
  const { campaignId } = await params;
  const sp = await searchParams;
  const token = verifyRenderToken(one(sp.t));
  if (!token || token.cid !== campaignId) return <RenderError message="Link de renderização inválido ou expirado." />;
  const vParam = one(sp.v);
  if (vParam !== undefined && Number(vParam) !== token.v) return <RenderError message="A versão pedida não corresponde ao link de renderização." />;
  const formatId = one(sp.f) as FormatId | undefined;
  const format = formatId ? FORMATS[formatId] : undefined;
  if (!format) return <RenderError message="Formato de peça desconhecido." />;
  const pRaw = one(sp.p) ?? "0";
  const pageIndex: number | "all" = pRaw === "all" ? "all" : Number.isInteger(Number(pRaw)) && Number(pRaw) >= 0 ? Number(pRaw) : 0;

  let bundle;
  try {
    bundle = await loadRenderBundle({ orgId: token.org }, campaignId, { version: token.v, signedUrlTtlSec: 1800 });
  } catch (e) {
    if (e instanceof AppError) return <RenderError message={e.message} />;
    throw e;
  }
  const template = getTemplate(bundle.templateId, bundle.templateVersion);
  if (!template) return <RenderError message={`Modelo ${bundle.templateId} v${bundle.templateVersion} não está disponível.`} />;
  const bleed = one(sp.bleed) === "1" && format.physical ? BLEED_PX : 0;
  const overrides = effectiveOverrides(bundle, format.id);
  // O Chromium arredonda o tamanho da folha do PDF; a cor de fundo cobre a eventual fresta de <1 px na borda.
  const bg = mergeColors(template, bundle.campaign.brand.colors, overrides.colors).background;

  return (
    <>
      <style>{`html,body{background:${bg.replace(/[^#\w(),.% -]/g, "")}!important}`}</style>
      <PieceRenderer
        campaign={bundle.campaign}
        template={template}
        format={format}
        overrides={overrides}
        pageIndex={pageIndex}
        bleedPx={bleed}
      />
      <ReadySignal />
    </>
  );
}
