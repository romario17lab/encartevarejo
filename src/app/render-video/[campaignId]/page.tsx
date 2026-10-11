// Cena animada do vídeo (prévia no editor, dentro de um iframe). Acesso por token assinado
// { cid, org, v } de validade curta, sem sessão. O MP4 é gerado pelo worker com o MESMO componente
// (<VideoScene/>) e o mesmo runtime, sem passar por esta rota.
import { getTemplate } from "@/templates/registry";
import { effectiveOverrides, loadRenderBundle } from "@/server/services/render-data";
import { AppError } from "@/server/errors";
import { VideoScene } from "@/render/video/Scene";
import { ORIENTATIONS, VIDEO_STYLES, type DurationChoice, type VideoOrientation, type VideoStyle } from "@/render/video/options";
import { verifyVideoToken } from "@/server/video/schema";
import { planForBundle } from "@/server/video/plan-bundle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function SceneError({ message }: { message: string }) {
  return <main data-ev-render-error={message} style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 24, color: "#fff", display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", textAlign: "center" }}><p>{message}</p></main>;
}

export default async function RenderVideoPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<SP> }) {
  const { campaignId } = await params;
  const sp = await searchParams;
  const token = verifyVideoToken(one(sp.t));
  if (!token || token.cid !== campaignId) return <SceneError message="Link da prévia inválido ou expirado. Abra a prévia de novo." />;
  const orientation = (one(sp.o) ?? "vertical") as VideoOrientation;
  const style = (one(sp.s) ?? "deslizar") as VideoStyle;
  const dRaw = one(sp.d) ?? "auto";
  const duration: DurationChoice = dRaw === "auto" ? "auto" : ([15, 30, 45, 60].includes(Number(dRaw)) ? (Number(dRaw) as DurationChoice) : "auto");
  if (!ORIENTATIONS[orientation] || !VIDEO_STYLES[style]) return <SceneError message="Opções de vídeo inválidas." />;

  let bundle;
  try {
    bundle = await loadRenderBundle({ orgId: token.org }, campaignId, { version: token.v, signedUrlTtlSec: 1800 });
  } catch (e) {
    if (e instanceof AppError) return <SceneError message={e.message} />;
    throw e;
  }
  const template = getTemplate(bundle.templateId, bundle.templateVersion);
  if (!template) return <SceneError message="O modelo desta campanha não está disponível." />;
  const plan = planForBundle(bundle, { orientation, style, duration });
  const overrides = effectiveOverrides(bundle, ORIENTATIONS[orientation].format);
  return <VideoScene campaign={bundle.campaign} template={template} overrides={overrides} plan={plan} preview autoplay={one(sp.autoplay) !== "0"} />;
}
