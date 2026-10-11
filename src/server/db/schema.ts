import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex, index, primaryKey, bigint, pgEnum,
} from "drizzle-orm/pg-core";
import type { Offer } from "@/domain/offer";
import type { PieceOverrides } from "@/domain/campaign";

// Convenções:
// - IDs: text (nanoid com prefixo, ex.: "org_..."), gerados em src/server/ids.ts
// - Dinheiro: integer em centavos
// - TODA tabela de dados de cliente tem org_id e TODA consulta filtra por org_id (ver src/server/tenant.ts)
// - Datas: timestamptz

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const roleEnum = pgEnum("member_role", ["admin", "editor", "aprovador"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["rascunho", "em_revisao", "aprovada", "agendada", "publicada", "encerrada"]);
export const exportStatusEnum = pgEnum("export_status", ["na_fila", "processando", "concluida", "falhou"]);

// ---------------- Plataforma ----------------
export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // "inicial" | "profissional" | "redes"
  name: text("name").notNull(),
  limits: jsonb("limits").$type<{
    stores: number; users: number; storageMb: number; exportsPerMonth: number;
    videoMinutesPerMonth: number; aiCreditsPerMonth: number; features: string[];
  }>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

// ---------------- Identidade e acesso ----------------
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  emailVerifiedAt: ts("email_verified_at"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 do token do cookie (o token em si nunca é salvo)
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activeOrgId: text("active_org_id"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(), // sha256 do token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/** Conta cliente (tenant). Uma conta pode ter várias lojas (filiais). */
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").$type<"varejo" | "agencia">().notNull().default("varejo"),
  planId: text("plan_id").notNull().references(() => plans.id),
  settings: jsonb("settings").$type<{ minMarginBp?: number | null; requireApproval?: boolean }>().notNull().default({}),
  isDemo: boolean("is_demo").notNull().default(false),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable("memberships", {
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  /** null = acesso a todas as lojas da conta; lista = somente essas lojas */
  storeIds: jsonb("store_ids").$type<string[] | null>().default(null),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  revokedAt: ts("revoked_at"),
  createdAt: createdAt(),
}, (t) => [index("invitations_org_idx").on(t.orgId), uniqueIndex("invitations_token_uq").on(t.tokenHash)]);

// ---------------- Identidade visual e lojas ----------------
/** Identidade visual compartilhável entre filiais */
export const brandKits = pgTable("brand_kits", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoAssetId: text("logo_asset_id"),
  colors: jsonb("colors").$type<{ primary: string; secondary: string; accent: string; text: string; background: string }>().notNull(),
  slogan: text("slogan"),
  legalText: text("legal_text"), // ex.: "Imagens ilustrativas. Ofertas válidas enquanto durarem os estoques."
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("brand_kits_org_idx").on(t.orgId)]);

export const stores = pgTable("stores", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  brandKitId: text("brand_kit_id").notNull().references(() => brandKits.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // endereço público da vitrine: /loja/{slug}
  segment: text("segment").notNull().default("supermercado"),
  phone: text("phone"),
  whatsapp: text("whatsapp"), // somente dígitos com DDI, ex.: 5511999990000
  email: text("email"),
  address: jsonb("address").$type<{ street?: string; number?: string; district?: string; city?: string; state?: string; zip?: string; complement?: string }>().notNull().default({}),
  socials: jsonb("socials").$type<{ instagram?: string; facebook?: string; tiktok?: string; website?: string }>().notNull().default({}),
  /** horários por dia da semana (0=domingo) "07:00-21:00" ou null = fechado */
  hours: jsonb("hours").$type<Record<string, string | null>>().notNull().default({}),
  hoursNote: text("hours_note"),
  storefrontEnabled: boolean("storefront_enabled").notNull().default(true),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("stores_slug_uq").on(t.slug), index("stores_org_idx").on(t.orgId)]);

// ---------------- Arquivos ----------------
export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"image" | "export" | "import" | "video">().notNull(),
  storageKey: text("storage_key").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256"),
  /** origem da imagem (exigido para catálogo): upload do lojista, banco autorizado, etc. */
  source: text("source").$type<"upload_lojista" | "importacao" | "banco_autorizado" | "demonstracao" | "gerado_sistema">().notNull(),
  sourceNote: text("source_note"),
  originalName: text("original_name"),
  createdBy: text("created_by"),
  createdAt: createdAt(),
}, (t) => [index("assets_org_idx").on(t.orgId), index("assets_org_sha_idx").on(t.orgId, t.sha256)]);

// ---------------- Catálogo ----------------
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  brand: text("brand"),
  category: text("category"),
  sizeLabel: text("size_label"),
  unit: text("unit"), // chave de UNITS em src/domain/offer.ts
  barcode: text("barcode"),
  imageAssetId: text("image_asset_id").references(() => assets.id, { onDelete: "set null" }),
  regularCents: integer("regular_cents"),
  promoCents: integer("promo_cents"),
  /** PRIVADO: nunca sai em vitrine, renderização ou exportação */
  costCents: integer("cost_cents"),
  conditions: text("conditions"),
  normalizedName: text("normalized_name").notNull(), // para busca e detecção de duplicados
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("products_org_idx").on(t.orgId), index("products_org_norm_idx").on(t.orgId, t.normalizedName), index("products_org_barcode_idx").on(t.orgId, t.barcode)]);

/** Preço específico por filial (sobrepõe o preço do produto naquela loja) */
export const storePrices = pgTable("store_prices", {
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  regularCents: integer("regular_cents"),
  promoCents: integer("promo_cents"),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.storeId, t.productId] })]);

// ---------------- Campanhas ----------------
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  storeId: text("store_id").notNull().references(() => stores.id),
  name: text("name").notNull(),
  title: text("title").notNull().default("Ofertas da Semana"),
  subtitle: text("subtitle"),
  status: campaignStatusEnum("status").notNull().default("rascunho"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  validityNote: text("validity_note"), // ex.: "ou enquanto durarem os estoques"
  /** modelo fixado: versões antigas continuam disponíveis no registro */
  templateId: text("template_id").notNull(),
  templateVersion: integer("template_version").notNull(),
  /** versão de conteúdo atual (incrementa a cada salvamento com mudança) */
  version: integer("version").notNull().default(1),
  /** hash dos dados que exigem aprovação (produtos, preços, condições, datas) */
  contentHash: text("content_hash").notNull().default(""),
  approvedVersion: integer("approved_version"),
  approvedHash: text("approved_hash"),
  approvedBy: text("approved_by"),
  approvedAt: ts("approved_at"),
  /** versão publicada na vitrine (instantâneo imutável em campaign_versions) */
  publishedVersion: integer("published_version"),
  publishedAt: ts("published_at"),
  scheduledPublishAt: ts("scheduled_publish_at"),
  /** campanha-mãe quando duplicada para filiais */
  parentCampaignId: text("parent_campaign_id"),
  overrides: jsonb("overrides").$type<PieceOverrides>().notNull().default({}),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("campaigns_org_idx").on(t.orgId), index("campaigns_store_idx").on(t.storeId), index("campaigns_status_idx").on(t.status, t.endsAt)]);

export const campaignItems = pgTable("campaign_items", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  brand: text("brand"),
  sizeLabel: text("size_label"),
  unit: text("unit"),
  category: text("category"),
  imageAssetId: text("image_asset_id").references(() => assets.id, { onDelete: "set null" }),
  imageFit: jsonb("image_fit").$type<{ x: number; y: number; zoom: number }>().notNull().default({ x: 50, y: 50, zoom: 1 }),
  offer: jsonb("offer").$type<Offer>().notNull(),
  highlight: boolean("highlight").notNull().default(false),
  position: integer("position").notNull(),
  paused: boolean("paused").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("campaign_items_campaign_idx").on(t.campaignId, t.position)]);

/** Peças (formatos) habilitadas na campanha, com personalização por formato */
export const campaignPieces = pgTable("campaign_pieces", {
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  format: text("format").notNull(), // FormatId
  enabled: boolean("enabled").notNull().default(true),
  overrides: jsonb("overrides").$type<PieceOverrides>().notNull().default({}),
  updatedAt: updatedAt(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.format] })]);

/** Histórico de versões: instantâneo completo e imutável (campanha + itens + peças) */
export const campaignVersions = pgTable("campaign_versions", {
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  contentHash: text("content_hash").notNull(),
  reason: text("reason"), // "salvamento automático", "aprovação", "restaurado da versão 3"
  createdBy: text("created_by"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.version] })]);

// ---------------- Exportações ----------------
export const exportJobs = pgTable("export_jobs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  campaignVersion: integer("campaign_version").notNull(),
  /** pedido: lista de { format, fileType } ou "pacote" */
  request: jsonb("request").$type<{ kind: "single" | "package"; items: Array<{ format: string; fileType: "png" | "jpeg" | "pdf" }>; bleed?: boolean }>().notNull(),
  status: exportStatusEnum("status").notNull().default("na_fila"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"), // mensagem amigável; detalhes técnicos só no log do servidor
  resultAssetId: text("result_asset_id"),
  /** descrição dos arquivos gerados (dimensões, dpi, páginas) */
  resultInfo: jsonb("result_info").$type<Array<{ path: string; format: string; fileType: string; widthPx?: number; heightPx?: number; widthMm?: number; heightMm?: number; dpi?: number; pages?: number; bytes: number }>>(),
  warnings: jsonb("warnings").$type<string[]>(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
}, (t) => [index("export_jobs_org_idx").on(t.orgId, t.createdAt), index("export_jobs_status_idx").on(t.status)]);

// ---------------- Auditoria e métricas ----------------
export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  orgId: text("org_id"),
  userId: text("user_id"),
  action: text("action").notNull(), // "campaign.update", "product.bulk_price", "member.invite", ...
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(), // frase em português
  data: jsonb("data"), // diferenças relevantes, SEM senhas/tokens/custos
  createdAt: createdAt(),
}, (t) => [index("audit_org_idx").on(t.orgId, t.createdAt)]);

export const storefrontEvents = pgTable("storefront_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  orgId: text("org_id").notNull(),
  storeId: text("store_id").notNull(),
  campaignId: text("campaign_id"),
  kind: text("kind").$type<"view" | "whatsapp_click" | "share" | "qr_scan">().notNull(),
  source: text("source"), // utm_source / origem do link de campanha
  createdAt: createdAt(),
}, (t) => [index("sf_events_store_idx").on(t.storeId, t.createdAt)]);

/** Calendário comercial: eventos globais (org_id null) ou da conta */
export const calendarEvents = pgTable("calendar_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id"),
  name: text("name").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  isMovable: boolean("is_movable").notNull().default(false),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("calendar_org_date_idx").on(t.orgId, t.date)]);

/** Modelos publicados pela administração (o código dos modelos fica em src/templates; aqui o controle de publicação) */
export const templateReleases = pgTable("template_releases", {
  templateId: text("template_id").notNull(),
  version: integer("version").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
  publishedAt: ts("published_at").notNull().defaultNow(),
  notes: text("notes"),
}, (t) => [primaryKey({ columns: [t.templateId, t.version] })]);

/** Tarefas de servidor recorrentes (publicação agendada e encerramento) registram execução aqui */
export const jobRuns = pgTable("job_runs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  result: jsonb("result"),
  createdAt: createdAt(),
});

/** Caixa de saída de e-mails transacionais. Sem SMTP configurado, as mensagens ficam aqui
 *  (visíveis em GET /api/dev/emails apenas fora de produção). */
export const emailOutbox = pgTable("email_outbox", {
  id: text("id").primaryKey(),
  orgId: text("org_id"),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body"),
  kind: text("kind").notNull(), // "password_reset" | "invitation" | ...
  status: text("status").$type<"armazenado" | "enviado" | "falhou">().notNull().default("armazenado"),
  createdAt: createdAt(),
  sentAt: ts("sent_at"),
}, (t) => [index("email_outbox_created_idx").on(t.createdAt)]);
