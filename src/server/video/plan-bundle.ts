// Plano do vídeo a partir dos dados da campanha (leve: usado na prévia, na API e no worker).
import type { RenderBundle } from "@/server/services/render-data";
import type { VideoOrientation } from "@/render/video/options";
import { planVideo, type VideoPlan } from "@/render/video/plan";

/** VIDEO_FPS: 30 (padrão) ou 25. */
export const videoFps = () => (Number(process.env.VIDEO_FPS ?? 30) === 25 ? 25 : 30);

export function planForBundle(bundle: Pick<RenderBundle, "campaign" | "pausedItemIds">, o: { orientation: VideoOrientation; style: VideoPlan["style"]; duration: VideoPlan["durationChoice"]; fps?: number }): VideoPlan {
  return planVideo({ items: bundle.campaign.items, pausedItemIds: bundle.pausedItemIds, orientation: o.orientation, style: o.style, duration: o.duration, fps: o.fps ?? videoFps() });
}
