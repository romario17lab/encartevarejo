// Respostas da API de gestão da TV (datas em ISO).
export interface TvScreenView {
  id: string; name: string; storeId: string; storeName: string | null;
  orientation: "horizontal" | "vertical"; slideSeconds: number;
  paired: boolean; pairedAt: string | null; lastSeenAt: string | null; revokedAt: string | null; online: boolean;
  pairingCode: string | null; pairingExpiresAt: string | null; itemCount: number; createdAt: string;
}
export interface TvScreensResponse {
  screens: TvScreenView[];
  stores: Array<{ id: string; name: string }>;
  feature: { included: boolean; message: string | null };
  canWrite: boolean;
}
export interface TvPlaylistRow {
  id?: string;
  kind: "campaign" | "video";
  campaignId: string | null;
  videoJobId: string | null;
  name: string;
  durationSec: number | null;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: number[] | null;
  hours: string | null;
  state?: "no_ar" | "agendado" | "fora";
  reason?: string | null;
}
export interface TvScreenDetail {
  screen: TvScreenView;
  items: TvPlaylistRow[];
  candidates: {
    campaigns: Array<{ id: string; name: string; status: string; startsAt: string | null; endsAt: string | null }>;
    videos: Array<{ id: string; campaignId: string; name: string; orientation: string; durationSec: number; createdAt: string }>;
  };
}

const TZ = "America/Sao_Paulo";
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/** Situação do aparelho em texto + tom do selo. */
export function screenStatus(s: TvScreenView): { label: string; tone: "success" | "warning" | "neutral" | "danger" } {
  if (s.paired && s.online) return { label: "Online", tone: "success" };
  if (s.paired && s.lastSeenAt) return { label: `Offline desde ${fmtDateTime(s.lastSeenAt)}`, tone: "danger" };
  if (s.paired) return { label: "Conectada, aguardando o player", tone: "warning" };
  return { label: s.revokedAt ? "Aparelho desconectado" : "Aguardando pareamento", tone: "neutral" };
}
