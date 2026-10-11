import { z } from "zod";
import { offerSchema, unitSchema, type Offer, type Unit } from "./offer";
import type { FormatId } from "./formats";

// ---------- Estados ----------
export const CAMPAIGN_STATUSES = ["rascunho", "em_revisao", "aprovada", "agendada", "publicada", "encerrada"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho", em_revisao: "Em revisão", aprovada: "Aprovada",
  agendada: "Agendada", publicada: "Publicada", encerrada: "Encerrada",
};

// ---------- Papéis e permissões (verificados SEMPRE no servidor) ----------
export const ROLES = ["admin", "editor", "aprovador"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", editor: "Editor", aprovador: "Aprovador" };

export type Permission =
  | "org.manage" | "members.manage" | "stores.manage" | "brand.manage"
  | "products.read" | "products.write"
  | "campaigns.read" | "campaigns.write" | "campaigns.submit" | "campaigns.approve" | "campaigns.publish"
  | "exports.create" | "audit.read" | "billing.manage";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["org.manage", "members.manage", "stores.manage", "brand.manage", "products.read", "products.write",
    "campaigns.read", "campaigns.write", "campaigns.submit", "campaigns.approve", "campaigns.publish",
    "exports.create", "audit.read", "billing.manage"],
  editor: ["products.read", "products.write", "campaigns.read", "campaigns.write", "campaigns.submit", "exports.create"],
  aprovador: ["products.read", "campaigns.read", "campaigns.approve", "campaigns.publish", "exports.create", "audit.read"],
};
export const can = (role: Role, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

// ---------- Item de campanha ----------
// O item guarda um "retrato" dos dados do produto usados na campanha (nome, foto, unidade)
// para que alterações futuras no catálogo não mudem campanhas já aprovadas sem passar por revisão.
export const campaignItemSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  name: z.string().min(1).max(120),
  brand: z.string().max(60).nullable(),
  sizeLabel: z.string().max(40).nullable(), // "1kg", "Lata 350ml", "Pacote 500g"
  unit: unitSchema.nullable(),
  category: z.string().max(60).nullable(),
  imageAssetId: z.string().nullable(),
  /** enquadramento da foto: object-position em % (0-100) e zoom >= 1, sem distorção */
  imageFit: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), zoom: z.number().min(1).max(3) }).default({ x: 50, y: 50, zoom: 1 }),
  offer: offerSchema,
  highlight: z.boolean().default(false),
  position: z.number().int(),
  paused: z.boolean().default(false), // "acabou": some da vitrine sem excluir
});
export type CampaignItem = z.infer<typeof campaignItemSchema>;

// ---------- Dados para renderização (contrato entre backend, layout e modelos) ----------
export interface RenderBrand {
  storeName: string;
  logoUrl: string | null;
  colors: { primary: string; secondary: string; accent: string; text: string; background: string };
  phone: string | null;
  whatsapp: string | null;
  address: string | null; // linha única pronta para exibir
  instagram: string | null;
  website: string | null; // URL da vitrine
  hours: string | null; // linha única pronta: "Seg a Sáb 7h–21h · Dom 7h–13h"
}

export interface RenderItem {
  id: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  unit: Unit | null;
  category: string | null;
  imageUrl: string | null;
  imageFit: { x: number; y: number; zoom: number };
  offer: Offer;
  highlight: boolean;
}

export interface RenderCampaign {
  id: string;
  version: number; // versão da campanha usada nesta renderização (impressa no rodapé técnico/arquivo)
  title: string; // ex.: "Ofertas da Semana"
  subtitle: string | null; // ex.: "Só neste fim de semana!"
  validityText: string; // ex.: "Ofertas válidas de 10/10 a 13/10/2026 ou enquanto durarem os estoques"
  legalText: string | null; // observações legais do rodapé
  items: RenderItem[];
  brand: RenderBrand;
  isDemo: boolean; // quando true, os modelos exibem a marca d'água "DADOS DE DEMONSTRAÇÃO"
}

/** Personalizações por campanha/peça (modo avançado). Nunca contém preços. */
export const pieceOverridesSchema = z.object({
  colors: z.object({ primary: z.string(), secondary: z.string(), accent: z.string(), text: z.string(), background: z.string() }).partial().optional(),
  title: z.string().max(60).optional(),
  subtitle: z.string().max(80).optional(),
  /** densidade: produtos por página/tela; "auto" deixa o motor decidir */
  itemsPerPage: z.union([z.literal("auto"), z.number().int().min(1).max(24)]).optional(),
  order: z.enum(["manual", "category"]).optional(),
  showCategoryHeaders: z.boolean().optional(),
  headerImageAssetId: z.string().nullable().optional(),
  hiddenItemIds: z.array(z.string()).optional(), // item fora desta peça (ex.: não aparece no story)
  fontScale: z.number().min(0.8).max(1.3).optional(),
});
export type PieceOverrides = z.infer<typeof pieceOverridesSchema>;

export type PieceKey = FormatId;
