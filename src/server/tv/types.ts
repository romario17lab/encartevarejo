// Contrato da programação entregue ao player (GET /api/tv/playlist) — só tipos, usado no servidor e no aparelho.
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { FormatId } from "@/domain/formats";
import type { ScheduleRule } from "./schedule";

export type TvOrientation = "horizontal" | "vertical";

interface TvItemBase {
  /** id do item da programação */
  id: string;
  position: number;
  schedule: ScheduleRule;
  /** ISO: depois disso o item nunca mais toca (fim da validade da campanha ou do agendamento) */
  validUntil: string | null;
  /** ISO: antes disso o item não toca (início da validade da campanha) */
  validFrom: string | null;
}

export interface TvCampaignItem extends TvItemBase {
  kind: "campaign";
  campaignId: string;
  name: string;
  campaign: RenderCampaign;
  templateId: string;
  templateVersion: number;
  format: FormatId;
  overrides: PieceOverrides;
  /** número de páginas (cada página = um slide) */
  pages: number;
  /** segundos de cada slide */
  slideSeconds: number;
}

export interface TvVideoItem extends TvItemBase {
  kind: "video";
  videoJobId: string;
  campaignId: string;
  name: string;
  url: string;
  orientation: TvOrientation;
  /** limite de tempo (s); null = até o fim do vídeo */
  maxSeconds: number | null;
  durationSec: number;
}

export type TvItem = TvCampaignItem | TvVideoItem;

export interface TvPlaylist {
  version: string;
  serverTime: string;
  pollSeconds: number;
  screen: { id: string; name: string; storeName: string; orientation: TvOrientation; slideSeconds: number };
  /** itens que tocam agora */
  items: TvItem[];
  /** itens válidos que não tocam agora (outro dia/horário): o aparelho avalia sozinho, inclusive offline */
  upcoming: TvItem[];
}
