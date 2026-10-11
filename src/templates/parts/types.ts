// Tipos internos dos modelos (Agente de Design). O contrato público está em ../contract.ts.
import type { FormatSpec } from "@/domain/formats";
import type { PieceOverrides, RenderCampaign } from "@/domain/campaign";
import type { PageLayout } from "../contract";

export type Colors = RenderCampaign["brand"]["colors"];

export type PriceShape = "band" | "pill" | "burst" | "seal" | "tag" | "plain" | "ribbon" | "chalk";
export type CardComposition = "stack" | "overlay" | "top-name";
export type HeaderVariant = "band" | "centered" | "split" | "minimal";

export interface FontRole { family: string; weight: number; upper?: boolean; italic?: boolean; letterSpacing?: number }

/** "Pele" do modelo: todas as decisões visuais que as peças compartilhadas leem. */
export interface Skin {
  fonts: { display: FontRole; body: FontRole; name: FontRole; price: FontRole };
  page: { bg: string };
  card: {
    composition: CardComposition;
    bg: string; fg: string; meta: string;
    border?: string; borderWidth?: number;
    /** raio como fração do menor lado do card */
    radius: number;
    shadow?: string;
    photoBg: string;
    nameAlign: "left" | "center";
    heroBg?: string; heroFg?: string;
  };
  price: {
    shape: PriceShape;
    bg: string; fg: string;
    /** cor do texto pequeno (De/por, Leve 3, condições) */
    smallFg?: string;
    chipBg: string; chipFg: string;
    strike: string;
    align: "left" | "center" | "right";
  };
  badge: { bg: string; fg: string; shape: "circle" | "burst" | "tab" };
  hero: { label: string; bg: string; fg: string } | null;
  section: { bg: string; fg: string; style: "bar" | "underline" | "pill" };
  header: { variant: HeaderVariant; bg: string; fg: string; accent: string; accentFg: string; /** fração da altura do cabeçalho reservada no topo para ornamentos */ insetTop?: number };
  footer: { bg: string; fg: string; accent: string; style: "bar" | "plain" | "card" };
  tag: { bandBg: string; bandFg: string; bg: string; fg: string; label: string };
}

export interface RenderCtx {
  campaign: RenderCampaign;
  page: PageLayout;
  format: FormatSpec;
  overrides: PieceOverrides;
  colors: Colors;
  skin: Skin;
  fontScale: number;
}

export interface DecorProps extends RenderCtx { w: number; h: number }
