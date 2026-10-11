import { and, asc, eq, inArray } from "drizzle-orm";
import { offerSchema, validateOffer, type Unit } from "@/domain/offer";
import type { CampaignItem, PieceOverrides } from "@/domain/campaign";
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_VERSIONS, getTemplate } from "@/templates/registry";
import { schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError } from "../errors";
import { sha256 } from "../signing";
import { canonicalJson } from "../text";

// Estado completo de uma campanha, instantâneo imutável (campaign_versions.snapshot) e hash de aprovação.

export type CampaignRow = typeof schema.campaigns.$inferSelect;
type ItemRow = typeof schema.campaignItems.$inferSelect;
type PieceRow = typeof schema.campaignPieces.$inferSelect;

export interface SnapshotCampaign {
  id: string;
  storeId: string;
  name: string;
  title: string;
  subtitle: string | null;
  startsAt: string | null; // ISO
  endsAt: string | null; // ISO
  validityNote: string | null;
  templateId: string;
  templateVersion: number;
  overrides: PieceOverrides;
}
export interface SnapshotPiece { format: FormatId; enabled: boolean; overrides: PieceOverrides }

/** Formato do JSON gravado em campaign_versions.snapshot (nunca contém custo). */
export interface CampaignSnapshot {
  campaign: SnapshotCampaign;
  items: CampaignItem[];
  pieces: SnapshotPiece[];
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function itemFromRow(r: ItemRow): CampaignItem {
  return {
    id: r.id, productId: r.productId, name: r.name, brand: r.brand, sizeLabel: r.sizeLabel, unit: (r.unit as Unit | null) ?? null,
    category: r.category, imageAssetId: r.imageAssetId, imageFit: r.imageFit, offer: offerSchema.parse(r.offer),
    highlight: r.highlight, position: r.position, paused: r.paused,
  };
}

export function snapshotCampaign(c: CampaignRow): SnapshotCampaign {
  return {
    id: c.id, storeId: c.storeId, name: c.name, title: c.title, subtitle: c.subtitle, startsAt: iso(c.startsAt), endsAt: iso(c.endsAt),
    validityNote: c.validityNote, templateId: c.templateId, templateVersion: c.templateVersion, overrides: c.overrides ?? {},
  };
}

export async function loadCampaignParts(db: Executor, orgId: string, campaignId: string) {
  const items = await db.select().from(schema.campaignItems)
    .where(and(eq(schema.campaignItems.orgId, orgId), eq(schema.campaignItems.campaignId, campaignId)))
    .orderBy(asc(schema.campaignItems.position), asc(schema.campaignItems.id));
  const pieces = await db.select().from(schema.campaignPieces)
    .where(and(eq(schema.campaignPieces.orgId, orgId), eq(schema.campaignPieces.campaignId, campaignId)));
  return { items: items.map(itemFromRow), pieces: sortPieces(pieces.map((p: PieceRow) => ({ format: p.format as FormatId, enabled: p.enabled, overrides: p.overrides ?? {} }))) };
}

export function sortPieces(p: SnapshotPiece[]): SnapshotPiece[] {
  return [...p].sort((a, b) => FORMAT_IDS.indexOf(a.format) - FORMAT_IDS.indexOf(b.format));
}

/**
 * Hash do que exige aprovação: produtos (nome, marca, tamanho, unidade), oferta completa (preços, mecânica,
 * condições, limites), loja e datas/validade. NÃO entram: ordem dos itens, destaque, foto/enquadramento,
 * título/subtítulo, cores/modelo e "pausado" (acabou o estoque: some da vitrine sem nova aprovação).
 */
export function computeContentHash(c: Pick<SnapshotCampaign, "storeId" | "startsAt" | "endsAt" | "validityNote">, items: CampaignItem[]): string {
  const itemKeys = items.map((i) => canonicalJson({
    name: i.name, brand: i.brand ?? null, sizeLabel: i.sizeLabel ?? null, unit: i.unit ?? null, offer: offerSchema.parse(i.offer),
  })).sort();
  return sha256(canonicalJson({ storeId: c.storeId, startsAt: c.startsAt, endsAt: c.endsAt, validityNote: c.validityNote ?? null, items: itemKeys }));
}

/** Comparação de "mudou alguma coisa" (inclui tudo, menos metadados de controle). */
export function stateFingerprint(s: CampaignSnapshot): string {
  return canonicalJson({ ...s, items: s.items.map((i, idx) => ({ ...i, position: idx })), pieces: sortPieces(s.pieces) });
}

// ---------------- Modelos ----------------
export function resolveTemplate(templateId?: string | null, version?: number | null) {
  if (TEMPLATE_VERSIONS.length === 0) {
    const id = templateId ?? DEFAULT_TEMPLATE_ID;
    if (id !== DEFAULT_TEMPLATE_ID) throw new AppError("validation", "Modelo não encontrado.");
    return { id, version: version ?? 1, name: "Modelo padrão", latestVersion: 1, supportedFormats: FORMAT_IDS };
  }
  const id = templateId ?? DEFAULT_TEMPLATE_ID;
  const t = getTemplate(id, version ?? undefined) ?? (templateId ? undefined : getTemplate(TEMPLATE_VERSIONS[0]!.id));
  if (!t) throw new AppError("validation", version ? `Versão ${version} do modelo não encontrada.` : "Modelo não encontrado.");
  return { id: t.id, version: t.version, name: t.name, latestVersion: getTemplate(t.id)!.version, supportedFormats: t.supportedFormats };
}

export function templateInfo(id: string, version: number) {
  const t = TEMPLATE_VERSIONS.length ? getTemplate(id, version) : undefined;
  const latest = TEMPLATE_VERSIONS.length ? getTemplate(id) : undefined;
  return { id, version, name: t?.name ?? latest?.name ?? "Modelo padrão", latestVersion: latest?.version ?? version };
}

// ---------------- Avisos ----------------
export interface CampaignIssue { itemId?: string; field: string; level: "error" | "warning"; message: string }

export async function computeIssues(db: Executor, orgId: string, c: Pick<SnapshotCampaign, "startsAt" | "endsAt">, items: CampaignItem[], now = new Date()): Promise<CampaignIssue[]> {
  const issues: CampaignIssue[] = [];
  if (!c.startsAt || !c.endsAt) issues.push({ field: "dates", level: "error", message: "Informe o período de validade da campanha." });
  else {
    if (new Date(c.endsAt) <= new Date(c.startsAt)) issues.push({ field: "dates", level: "error", message: "A data final precisa ser depois da data inicial." });
    if (new Date(c.endsAt) < now) issues.push({ field: "dates", level: "error", message: "A validade da campanha já terminou. Ajuste as datas." });
  }
  const active = items.filter((i) => !i.paused);
  if (active.length === 0) issues.push({ field: "items", level: "error", message: "Adicione pelo menos um produto à campanha." });

  const [org] = await db.select({ settings: schema.organizations.settings }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  const minMarginBp = org?.settings?.minMarginBp ?? null;
  const productIds = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const costs = new Map<string, number | null>();
  if (productIds.length && minMarginBp != null) {
    const rows = await db.select({ id: schema.products.id, cost: schema.products.costCents }).from(schema.products)
      .where(and(eq(schema.products.orgId, orgId), inArray(schema.products.id, productIds)));
    rows.forEach((r) => costs.set(r.id, r.cost));
  }
  for (const it of items) {
    for (const i of validateOffer(it.offer, { unit: it.unit, minMarginBp, costCents: it.productId ? costs.get(it.productId) ?? null : null }))
      issues.push({ itemId: it.id, field: i.field, level: i.level, message: `${it.name}: ${i.message}` });
    if (!it.imageAssetId && !it.paused) issues.push({ itemId: it.id, field: "imageAssetId", level: "warning", message: `${it.name}: produto sem foto.` });
  }
  return issues;
}

export const hasErrors = (issues: CampaignIssue[]) => issues.some((i) => i.level === "error");
