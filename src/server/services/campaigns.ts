import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { campaignItemSchema, CAMPAIGN_STATUSES, pieceOverridesSchema, type CampaignItem } from "@/domain/campaign";
import { emptyOffer, offerSchema, type Offer, type Unit } from "@/domain/offer";
import { FORMAT_IDS, type FormatId } from "@/domain/formats";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor, Tx } from "../db/tx";
import { AppError, notFound } from "../errors";
import { newId } from "../ids";
import { writeAudit } from "../audit";
import { normalizeName } from "../text";
import { canAccessStore, getAccessibleStore, requirePermission, storeScope } from "../tenant";
import {
  computeContentHash, computeIssues, iso, loadCampaignParts, resolveTemplate, snapshotCampaign, sortPieces, stateFingerprint, templateInfo,
  type CampaignRow, type CampaignSnapshot, type SnapshotCampaign, type SnapshotPiece,
} from "./campaign-state";

export const CONFLICT_MESSAGE = "Esta campanha foi alterada em outro lugar. Recarregue para ver a versão mais recente.";
const APPROVED_STATES = ["aprovada", "agendada", "publicada"] as const;
const MAX_ITEMS = 300;

type ProductRow = typeof schema.products.$inferSelect;
type StorePriceRow = typeof schema.storePrices.$inferSelect;

// ---------------- Leitura ----------------
export async function getCampaignRow(ctx: TenantCtx, id: string, db: Executor = getDb(), opts: { forUpdate?: boolean } = {}): Promise<CampaignRow> {
  const q = db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.orgId), isNull(schema.campaigns.deletedAt)));
  const [row] = opts.forUpdate ? await q.for("update") : await q;
  if (!row) throw notFound("Campanha");
  if (!canAccessStore(ctx, row.storeId)) throw new AppError("forbidden", "Você não tem acesso às campanhas desta loja.");
  return row;
}

function presentCampaign(c: CampaignRow) {
  const { deletedAt: _d, orgId: _o, ...rest } = c;
  return rest;
}

/** Estado completo para o editor. */
export async function getEditorState(ctx: TenantCtx, id: string, db: Executor = getDb()) {
  requirePermission(ctx, "campaigns.read");
  const c = await getCampaignRow(ctx, id, db);
  const { items, pieces } = await loadCampaignParts(db, ctx.orgId, id);
  const [store] = await db.select({ id: schema.stores.id, name: schema.stores.name, slug: schema.stores.slug, brandKitId: schema.stores.brandKitId })
    .from(schema.stores).where(and(eq(schema.stores.id, c.storeId), eq(schema.stores.orgId, ctx.orgId)));
  const issues = await computeIssues(db, ctx.orgId, { startsAt: iso(c.startsAt), endsAt: iso(c.endsAt) }, items);
  return {
    campaign: { ...presentCampaign(c), needsReapproval: c.approvedHash !== null && c.approvedHash !== c.contentHash },
    items: items.map((i) => ({ ...i, imageUrl: i.imageAssetId ? `/api/assets/${i.imageAssetId}` : null })),
    pieces,
    template: templateInfo(c.templateId, c.templateVersion),
    issues,
    store: store ?? null,
  };
}

export interface CampaignListQuery { status?: string | null; storeId?: string | null; from?: string | null; to?: string | null; q?: string | null; limit?: number }

export async function listCampaigns(ctx: TenantCtx, q: CampaignListQuery) {
  requirePermission(ctx, "campaigns.read");
  const conds: (SQL | undefined)[] = [eq(schema.campaigns.orgId, ctx.orgId), isNull(schema.campaigns.deletedAt), storeScope(ctx, schema.campaigns.storeId)];
  if (q.status) {
    const sts = q.status.split(",").filter((s): s is (typeof CAMPAIGN_STATUSES)[number] => (CAMPAIGN_STATUSES as readonly string[]).includes(s));
    if (sts.length) conds.push(inArray(schema.campaigns.status, sts));
  }
  if (q.storeId) conds.push(eq(schema.campaigns.storeId, q.storeId));
  // intervalo do calendário: campanhas que se sobrepõem a [from, to]
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (from && !isNaN(+from)) conds.push(or(isNull(schema.campaigns.endsAt), gte(schema.campaigns.endsAt, from)));
  if (to && !isNaN(+to)) conds.push(or(isNull(schema.campaigns.startsAt), lte(schema.campaigns.startsAt, to)));
  if (q.q?.trim()) conds.push(sql`${schema.campaigns.name} ilike ${"%" + q.q.trim().replace(/[%_]/g, "") + "%"}`);
  const rows = await getDb().select({
    c: schema.campaigns, storeName: schema.stores.name,
    itemCount: sql<number>`(select count(*)::int from ${schema.campaignItems} ci where ci.campaign_id = ${schema.campaigns.id})`,
  }).from(schema.campaigns).innerJoin(schema.stores, eq(schema.stores.id, schema.campaigns.storeId))
    .where(and(...conds)).orderBy(desc(schema.campaigns.updatedAt)).limit(Math.min(q.limit ?? 200, 500));
  return rows.map((r) => ({
    id: r.c.id, name: r.c.name, title: r.c.title, status: r.c.status, storeId: r.c.storeId, storeName: r.storeName,
    startsAt: r.c.startsAt, endsAt: r.c.endsAt, version: r.c.version, publishedVersion: r.c.publishedVersion, publishedAt: r.c.publishedAt,
    scheduledPublishAt: r.c.scheduledPublishAt, templateId: r.c.templateId, templateVersion: r.c.templateVersion,
    parentCampaignId: r.c.parentCampaignId, itemCount: r.itemCount, updatedAt: r.c.updatedAt,
    needsReapproval: r.c.approvedHash !== null && r.c.approvedHash !== r.c.contentHash,
  }));
}

// ---------------- Preços: retrato do produto ----------------
/** Oferta inicial a partir do produto (ou do preço da filial). Nunca inventa preço ausente. */
export function offerFromPrices(regular: number | null, promo: number | null, conditions: string | null): Offer {
  const o = emptyOffer();
  if (promo != null && regular != null && regular > promo) { o.mode = "from_to"; o.priceCents = promo; o.regularCents = regular; }
  else if (promo != null) { o.priceCents = promo; }
  else if (regular != null) { o.priceCents = regular; }
  o.conditions = conditions ? conditions.slice(0, 160) : null;
  return o;
}

function itemFromProduct(p: ProductRow, sp: StorePriceRow | undefined, position: number): CampaignItem {
  const regular = sp ? sp.regularCents ?? p.regularCents : p.regularCents;
  const promo = sp ? sp.promoCents : p.promoCents;
  return {
    id: newId("itm"), productId: p.id, name: p.name.slice(0, 120), brand: p.brand?.slice(0, 60) ?? null, sizeLabel: p.sizeLabel?.slice(0, 40) ?? null,
    unit: (p.unit as Unit | null) ?? null, category: p.category?.slice(0, 60) ?? null, imageAssetId: p.imageAssetId,
    imageFit: { x: 50, y: 50, zoom: 1 }, offer: offerFromPrices(regular, promo, p.conditions), highlight: false, position, paused: false,
  };
}

/** Aplica o preço da filial (ou do catálogo) à oferta de um item copiado. Combos e itens manuais ficam como estão. */
function repriceOffer(offer: Offer, p: ProductRow | undefined, sp: StorePriceRow | undefined): { offer: Offer; source: "preco_da_loja" | "catalogo" | "mantido" } {
  if (!p || offer.mode === "combo") return { offer, source: "mantido" };
  const regular = sp ? sp.regularCents ?? p.regularCents : p.regularCents;
  const promo = sp ? sp.promoCents : p.promoCents;
  const source = sp ? "preco_da_loja" as const : "catalogo" as const;
  const o = { ...offer };
  if (o.mode === "from_to") {
    if (promo == null || regular == null) return { offer, source: "mantido" };
    o.priceCents = promo; o.regularCents = regular;
  } else {
    const price = promo ?? regular;
    if (price == null) return { offer, source: "mantido" };
    o.priceCents = price;
  }
  return { offer: o, source };
}

// ---------------- Criação ----------------
const dateInput = z.union([z.string(), z.date()]).nullable().optional().transform((v, ctx) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(+d)) { ctx.addIssue({ code: "custom", message: "Data inválida." }); return z.NEVER; }
  return d;
});

const createSchema = z.object({
  storeId: z.string().min(1, "Escolha a loja."),
  name: z.string().trim().min(1, "Dê um nome para a campanha.").max(120),
  title: z.string().trim().min(1).max(60).optional(),
  subtitle: z.string().trim().max(80).nullable().optional(),
  templateId: z.string().nullable().optional(),
  startsAt: dateInput,
  endsAt: dateInput,
  validityNote: z.string().trim().max(120).nullable().optional(),
  productIds: z.array(z.string()).max(MAX_ITEMS).optional(),
});

async function insertCampaignWithState(tx: Tx, ctx: TenantCtx, row: Omit<typeof schema.campaigns.$inferInsert, "version" | "contentHash" | "orgId" | "createdBy">,
  items: CampaignItem[], pieces: SnapshotPiece[], reason: string) {
  const snapC: SnapshotCampaign = {
    id: row.id, storeId: row.storeId, name: row.name, title: row.title ?? "Ofertas da Semana", subtitle: row.subtitle ?? null,
    startsAt: iso(row.startsAt ?? null), endsAt: iso(row.endsAt ?? null), validityNote: row.validityNote ?? null,
    templateId: row.templateId, templateVersion: row.templateVersion, overrides: row.overrides ?? {},
  };
  const contentHash = computeContentHash(snapC, items);
  const [c] = await tx.insert(schema.campaigns).values({ ...row, orgId: ctx.orgId, version: 1, contentHash, createdBy: ctx.userId, updatedBy: ctx.userId }).returning();
  await writeItems(tx, ctx.orgId, row.id, items, []);
  await writePieces(tx, ctx.orgId, row.id, pieces);
  const snapshot: CampaignSnapshot = { campaign: snapC, items, pieces };
  await tx.insert(schema.campaignVersions).values({ orgId: ctx.orgId, campaignId: row.id, version: 1, snapshot, contentHash, reason, createdBy: ctx.userId });
  return c!;
}

async function writeItems(tx: Tx, orgId: string, campaignId: string, items: CampaignItem[], existingIds: string[]) {
  const keep = new Set(items.map((i) => i.id));
  const toDelete = existingIds.filter((id) => !keep.has(id));
  if (toDelete.length) await tx.delete(schema.campaignItems).where(and(eq(schema.campaignItems.orgId, orgId), eq(schema.campaignItems.campaignId, campaignId), inArray(schema.campaignItems.id, toDelete)));
  const existing = new Set(existingIds);
  for (const [idx, i] of items.entries()) {
    const values = {
      productId: i.productId, name: i.name, brand: i.brand, sizeLabel: i.sizeLabel, unit: i.unit, category: i.category,
      imageAssetId: i.imageAssetId, imageFit: i.imageFit, offer: i.offer, highlight: i.highlight, position: idx, paused: i.paused, updatedAt: new Date(),
    };
    if (existing.has(i.id)) {
      await tx.update(schema.campaignItems).set(values).where(and(eq(schema.campaignItems.id, i.id), eq(schema.campaignItems.orgId, orgId), eq(schema.campaignItems.campaignId, campaignId)));
    } else {
      await tx.insert(schema.campaignItems).values({ ...values, id: i.id, orgId, campaignId });
    }
  }
}

async function writePieces(tx: Tx, orgId: string, campaignId: string, pieces: SnapshotPiece[]) {
  await tx.delete(schema.campaignPieces).where(and(eq(schema.campaignPieces.orgId, orgId), eq(schema.campaignPieces.campaignId, campaignId)));
  if (pieces.length) await tx.insert(schema.campaignPieces).values(pieces.map((p) => ({ orgId, campaignId, format: p.format, enabled: p.enabled, overrides: p.overrides })));
}

function defaultPieces(supported: readonly FormatId[]): SnapshotPiece[] {
  return FORMAT_IDS.filter((f) => supported.includes(f)).map((format) => ({ format, enabled: true, overrides: {} }));
}

async function loadProducts(db: Executor, orgId: string, ids: string[]) {
  if (!ids.length) return new Map<string, ProductRow>();
  const rows = await db.select().from(schema.products).where(and(eq(schema.products.orgId, orgId), inArray(schema.products.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

async function loadStorePrices(db: Executor, orgId: string, storeId: string, productIds: string[]) {
  if (!productIds.length) return new Map<string, StorePriceRow>();
  const rows = await db.select().from(schema.storePrices)
    .where(and(eq(schema.storePrices.orgId, orgId), eq(schema.storePrices.storeId, storeId), inArray(schema.storePrices.productId, productIds)));
  return new Map(rows.map((r) => [r.productId, r]));
}

export async function createCampaign(ctx: TenantCtx, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = createSchema.parse(raw);
  const db = getDb();
  await getAccessibleStore(ctx, input.storeId, db);
  const tpl = resolveTemplate(input.templateId);
  const productIds = [...new Set(input.productIds ?? [])];
  const products = await loadProducts(db, ctx.orgId, productIds);
  if (products.size !== productIds.length) throw new AppError("validation", "Um ou mais produtos não foram encontrados nesta conta.");
  const sps = await loadStorePrices(db, ctx.orgId, input.storeId, productIds);
  const items = productIds.map((pid, idx) => itemFromProduct(products.get(pid)!, sps.get(pid), idx));
  const id = newId("cmp");
  const c = await db.transaction(async (tx) => {
    const c = await insertCampaignWithState(tx, ctx, {
      id, storeId: input.storeId, name: input.name, title: input.title ?? "Ofertas da Semana", subtitle: input.subtitle ?? null,
      startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, validityNote: input.validityNote ?? "ou enquanto durarem os estoques",
      templateId: tpl.id, templateVersion: tpl.version, overrides: {},
    }, items, defaultPieces(tpl.supportedFormats), "criação");
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.create", entityType: "campaign", entityId: id, summary: `Campanha "${input.name}" criada com ${items.length} produto(s).` });
    return c;
  });
  return getEditorState(ctx, c.id);
}

// ---------------- Salvamento (autosave) ----------------
const itemInputSchema = campaignItemSchema.extend({
  id: z.string().max(40).optional(),
  position: z.number().int().optional(),
  imageFit: campaignItemSchema.shape.imageFit.optional(),
  highlight: z.boolean().optional(),
  paused: z.boolean().optional(),
  brand: z.string().max(60).nullable().optional(),
  sizeLabel: z.string().max(40).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  imageAssetId: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
  unit: campaignItemSchema.shape.unit.optional(),
  /** true = também atualiza o produto no catálogo (nome, marca, tamanho, unidade, foto, preços) */
  updateCatalog: z.boolean().optional(),
});
const pieceInputSchema = z.object({ format: z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]), enabled: z.boolean().default(true), overrides: pieceOverridesSchema.default({}) });

const saveSchema = z.object({
  baseVersion: z.number().int().min(1),
  campaign: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(60).optional(),
    subtitle: z.string().trim().max(80).nullable().optional(),
    startsAt: dateInput,
    endsAt: dateInput,
    validityNote: z.string().trim().max(120).nullable().optional(),
    storeId: z.string().optional(),
    overrides: pieceOverridesSchema.optional(),
  }).optional(),
  items: z.array(itemInputSchema).max(MAX_ITEMS, `No máximo ${MAX_ITEMS} produtos por campanha.`).optional(),
  pieces: z.array(pieceInputSchema).optional(),
});

interface NextState {
  campaign?: Partial<SnapshotCampaign> & { startsAt?: string | null; endsAt?: string | null };
  items?: Array<z.output<typeof itemInputSchema>>;
  pieces?: SnapshotPiece[];
}

/**
 * Aplica um novo estado à campanha com concorrência otimista. Cria versão (instantâneo) quando algo muda.
 * Se o conteúdo que exige aprovação mudar numa campanha aprovada/agendada/publicada, ela volta a rascunho
 * (a vitrine continua mostrando a versão publicada anterior até nova aprovação e publicação).
 */
async function applyState(ctx: TenantCtx, campaignId: string, baseVersion: number | null, next: NextState, reason: string, action = "campaign.update") {
  const db = getDb();
  return db.transaction(async (tx) => {
    const row = await getCampaignRow(ctx, campaignId, tx, { forUpdate: true });
    if (baseVersion !== null && baseVersion !== row.version)
      throw new AppError("conflict", CONFLICT_MESSAGE, { currentVersion: row.version });
    const cur = await loadCampaignParts(tx, ctx.orgId, campaignId);
    const curSnap: CampaignSnapshot = { campaign: snapshotCampaign(row), items: cur.items, pieces: cur.pieces };

    const nc: SnapshotCampaign = { ...curSnap.campaign, ...Object.fromEntries(Object.entries(next.campaign ?? {}).filter(([, v]) => v !== undefined)) } as SnapshotCampaign;
    if (nc.storeId !== row.storeId) await getAccessibleStore(ctx, nc.storeId, tx);

    let items = cur.items;
    const catalogUpdates: Array<{ productId: string; item: CampaignItem }> = [];
    if (next.items) {
      const existingIds = new Set(cur.items.map((i) => i.id));
      const curById = new Map(cur.items.map((i) => [i.id, i]));
      const candidateIds = next.items.map((i) => i.id).filter((id): id is string => !!id && !existingIds.has(id) && /^itm_[0-9a-z]{20}$/.test(id));
      const taken = candidateIds.length
        ? new Set((await tx.select({ id: schema.campaignItems.id }).from(schema.campaignItems).where(inArray(schema.campaignItems.id, candidateIds))).map((r) => r.id))
        : new Set<string>();
      const seen = new Set<string>();
      items = next.items.map((i, idx) => {
        let id = i.id && (existingIds.has(i.id) || (candidateIds.includes(i.id) && !taken.has(i.id))) ? i.id : newId("itm");
        if (seen.has(id)) id = newId("itm");
        seen.add(id);
        const prev = curById.get(id);
        const it: CampaignItem = {
          id, productId: i.productId ?? prev?.productId ?? null, name: i.name, brand: i.brand ?? null, sizeLabel: i.sizeLabel ?? null, unit: i.unit ?? null,
          category: i.category ?? null, imageAssetId: i.imageAssetId ?? null, imageFit: i.imageFit ?? prev?.imageFit ?? { x: 50, y: 50, zoom: 1 },
          offer: offerSchema.parse(i.offer), highlight: i.highlight ?? false, position: idx, paused: i.paused ?? false,
        };
        if (i.updateCatalog && it.productId) catalogUpdates.push({ productId: it.productId, item: it });
        return it;
      });
      // referências precisam ser desta conta
      const pids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
      const okP = await loadProducts(tx, ctx.orgId, pids);
      for (const it of items) if (it.productId && !okP.has(it.productId)) it.productId = null;
      const aids = [...new Set(items.map((i) => i.imageAssetId).filter((x): x is string => !!x))];
      if (aids.length) {
        const okA = new Set((await tx.select({ id: schema.assets.id }).from(schema.assets).where(and(eq(schema.assets.orgId, ctx.orgId), inArray(schema.assets.id, aids)))).map((r) => r.id));
        const bad = aids.filter((a) => !okA.has(a));
        if (bad.length) throw new AppError("validation", "Uma das imagens não pertence a esta conta.");
      }
    }
    const pieces = next.pieces ? sortPieces(dedupePieces(next.pieces)) : cur.pieces;
    const nextSnap: CampaignSnapshot = { campaign: nc, items, pieces };

    if (stateFingerprint(nextSnap) === stateFingerprint(curSnap) && catalogUpdates.length === 0) {
      return { changed: false as const };
    }
    const contentHash = computeContentHash(nc, items);
    const version = row.version + 1;
    const hashChanged = contentHash !== row.contentHash;
    const patch: Partial<typeof schema.campaigns.$inferInsert> = {
      storeId: nc.storeId, name: nc.name, title: nc.title, subtitle: nc.subtitle, startsAt: nc.startsAt ? new Date(nc.startsAt) : null,
      endsAt: nc.endsAt ? new Date(nc.endsAt) : null, validityNote: nc.validityNote, templateId: nc.templateId, templateVersion: nc.templateVersion,
      overrides: nc.overrides, version, contentHash, updatedBy: ctx.userId, updatedAt: new Date(),
    };
    let reapproval: Record<string, unknown> | null = null;
    if (hashChanged && (APPROVED_STATES as readonly string[]).includes(row.status)) {
      reapproval = { previousStatus: row.status, previousApprovedVersion: row.approvedVersion, approvedHash: row.approvedHash, approvedBy: row.approvedBy };
      Object.assign(patch, { status: "rascunho", approvedVersion: null, approvedHash: null, approvedBy: null, approvedAt: null, scheduledPublishAt: null });
    }
    await tx.update(schema.campaigns).set(patch).where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.orgId, ctx.orgId)));
    if (next.items) await writeItems(tx, ctx.orgId, campaignId, items, cur.items.map((i) => i.id));
    if (next.pieces) await writePieces(tx, ctx.orgId, campaignId, pieces);
    await tx.insert(schema.campaignVersions).values({ orgId: ctx.orgId, campaignId, version, snapshot: nextSnap, contentHash, reason, createdBy: ctx.userId });
    for (const u of catalogUpdates) {
      requirePermission(ctx, "products.write");
      const o = u.item.offer;
      await tx.update(schema.products).set({
        name: u.item.name, brand: u.item.brand, sizeLabel: u.item.sizeLabel, unit: u.item.unit, category: u.item.category, imageAssetId: u.item.imageAssetId,
        // preço anunciado vira o preço de oferta do catálogo; preço "de" (quando informado) vira o preço normal
        ...(o.mode !== "combo" && o.priceCents != null ? { promoCents: o.priceCents, ...(o.regularCents != null ? { regularCents: o.regularCents } : {}) } : {}),
        normalizedName: normalizeName(u.item.name), updatedAt: new Date(),
      }).where(and(eq(schema.products.id, u.productId), eq(schema.products.orgId, ctx.orgId)));
    }
    await writeAudit(tx, {
      orgId: ctx.orgId, userId: ctx.userId, action, entityType: "campaign", entityId: campaignId,
      summary: reapproval
        ? `Campanha "${nc.name}" alterada após aprovação (versão ${version}); voltou para rascunho e precisa de nova aprovação.`
        : `Campanha "${nc.name}" salva (versão ${version}).`,
      data: { version, reason, contentChanged: hashChanged, ...(reapproval ? { reapproval } : {}), ...(catalogUpdates.length ? { catalogUpdated: catalogUpdates.map((c) => c.productId) } : {}) },
    });
    return { changed: true as const, version };
  });
}

function dedupePieces(p: SnapshotPiece[]): SnapshotPiece[] {
  const m = new Map<FormatId, SnapshotPiece>();
  for (const x of p) m.set(x.format, { format: x.format, enabled: x.enabled, overrides: x.overrides ?? {} });
  return [...m.values()];
}

export async function saveCampaign(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = saveSchema.parse(raw);
  const c = input.campaign;
  const r = await applyState(ctx, id, input.baseVersion, {
    campaign: c ? { ...c, startsAt: c.startsAt === undefined ? undefined : iso(c.startsAt), endsAt: c.endsAt === undefined ? undefined : iso(c.endsAt) } : undefined,
    items: input.items, pieces: input.pieces,
  }, "salvamento");
  return { ...(await getEditorState(ctx, id)), saved: r.changed };
}

// ---------------- Versões ----------------
export async function listVersions(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "campaigns.read");
  const c = await getCampaignRow(ctx, id);
  const rows = await getDb().select({
    version: schema.campaignVersions.version, contentHash: schema.campaignVersions.contentHash, reason: schema.campaignVersions.reason,
    createdAt: schema.campaignVersions.createdAt, createdBy: schema.campaignVersions.createdBy, createdByName: schema.users.name,
  }).from(schema.campaignVersions).leftJoin(schema.users, eq(schema.users.id, schema.campaignVersions.createdBy))
    .where(and(eq(schema.campaignVersions.orgId, ctx.orgId), eq(schema.campaignVersions.campaignId, id))).orderBy(desc(schema.campaignVersions.version));
  return rows.map((r) => ({ ...r, isCurrent: r.version === c.version, isPublished: r.version === c.publishedVersion, isApproved: r.version === c.approvedVersion }));
}

export async function getVersionSnapshot(ctx: TenantCtx, id: string, version: number, db: Executor = getDb()): Promise<CampaignSnapshot> {
  await getCampaignRow(ctx, id, db);
  const [v] = await db.select().from(schema.campaignVersions)
    .where(and(eq(schema.campaignVersions.orgId, ctx.orgId), eq(schema.campaignVersions.campaignId, id), eq(schema.campaignVersions.version, version)));
  if (!v) throw notFound("Versão");
  return v.snapshot as CampaignSnapshot;
}

export async function restoreVersion(ctx: TenantCtx, id: string, version: number, raw: unknown = {}) {
  requirePermission(ctx, "campaigns.write");
  const { baseVersion } = z.object({ baseVersion: z.number().int().optional() }).parse(raw ?? {});
  const snap = await getVersionSnapshot(ctx, id, version);
  const { id: _id, ...campaign } = snap.campaign;
  await applyState(ctx, id, baseVersion ?? null, {
    campaign,
    items: snap.items.map((i) => ({ ...i, offer: offerSchema.parse(i.offer) })),
    pieces: snap.pieces,
  }, `restaurado da versão ${version}`, "campaign.restore");
  return getEditorState(ctx, id);
}

// ---------------- Troca de modelo ----------------
export async function switchTemplate(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = z.object({ templateId: z.string().min(1), templateVersion: z.number().int().min(1).optional(), baseVersion: z.number().int().optional() }).parse(raw);
  const tpl = resolveTemplate(input.templateId, input.templateVersion);
  await applyState(ctx, id, input.baseVersion ?? null, { campaign: { templateId: tpl.id, templateVersion: tpl.version } }, `modelo alterado para ${tpl.name} v${tpl.version}`, "campaign.template");
  return getEditorState(ctx, id);
}

// ---------------- Duplicação e filiais ----------------
async function branchPlan(ctx: TenantCtx, source: CampaignRow, items: CampaignItem[], storeId: string, db: Executor) {
  const pids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = await loadProducts(db, ctx.orgId, pids);
  const sps = await loadStorePrices(db, ctx.orgId, storeId, pids);
  return items.map((i) => {
    const r = storeId === source.storeId ? { offer: i.offer, source: "mantido" as const } : repriceOffer(i.offer, i.productId ? products.get(i.productId) : undefined, i.productId ? sps.get(i.productId) : undefined);
    return { item: i, newOffer: r.offer, source: r.source };
  });
}

export async function branchPreview(ctx: TenantCtx, id: string, storeIds: string[]) {
  requirePermission(ctx, "campaigns.read");
  const db = getDb();
  const c = await getCampaignRow(ctx, id, db);
  const { items } = await loadCampaignParts(db, ctx.orgId, id);
  const out = [];
  for (const sid of [...new Set(storeIds)]) {
    const store = await getAccessibleStore(ctx, sid, db);
    const plan = await branchPlan(ctx, c, items, sid, db);
    out.push({
      storeId: sid, storeName: store.name,
      differences: plan.filter((p) => p.newOffer.priceCents !== p.item.offer.priceCents || p.newOffer.regularCents !== p.item.offer.regularCents).map((p) => ({
        itemId: p.item.id, name: p.item.name, source: p.source,
        currentPriceCents: p.item.offer.priceCents, newPriceCents: p.newOffer.priceCents,
        currentRegularCents: p.item.offer.regularCents, newRegularCents: p.newOffer.regularCents,
      })),
      unchangedCount: plan.filter((p) => p.newOffer.priceCents === p.item.offer.priceCents && p.newOffer.regularCents === p.item.offer.regularCents).length,
    });
  }
  return { stores: out };
}

export async function duplicateCampaign(ctx: TenantCtx, id: string, raw: unknown) {
  requirePermission(ctx, "campaigns.write");
  const input = z.object({ storeIds: z.array(z.string()).max(50).optional(), name: z.string().trim().min(1).max(120).optional() }).parse(raw ?? {});
  const db = getDb();
  const src = await getCampaignRow(ctx, id, db);
  const { items, pieces } = await loadCampaignParts(db, ctx.orgId, id);
  const targets = input.storeIds?.length ? [...new Set(input.storeIds)] : [src.storeId];
  const stores: Array<typeof schema.stores.$inferSelect> = [];
  for (const sid of targets) stores.push(await getAccessibleStore(ctx, sid, db));
  const created = await db.transaction(async (tx) => {
    const out: Array<{ id: string; storeId: string; storeName: string; name: string }> = [];
    for (const store of stores) {
      const plan = await branchPlan(ctx, src, items, store.id, tx);
      const newItems = plan.map((p, idx) => ({ ...p.item, id: newId("itm"), offer: p.newOffer, position: idx }));
      const cid = newId("cmp");
      const name = input.name ?? (store.id === src.storeId ? `${src.name} (cópia)` : `${src.name} – ${store.name}`);
      await insertCampaignWithState(tx, ctx, {
        id: cid, storeId: store.id, name: name.slice(0, 120), title: src.title, subtitle: src.subtitle, startsAt: src.startsAt, endsAt: src.endsAt,
        validityNote: src.validityNote, templateId: src.templateId, templateVersion: src.templateVersion, overrides: src.overrides, parentCampaignId: src.id,
      }, newItems, pieces, `duplicada de "${src.name}"`);
      await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.duplicate", entityType: "campaign", entityId: cid, summary: `Campanha "${src.name}" duplicada para a loja "${store.name}".`, data: { sourceId: src.id } });
      out.push({ id: cid, storeId: store.id, storeName: store.name, name });
    }
    return out;
  });
  return { campaigns: created };
}

export async function deleteCampaign(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "campaigns.write");
  const db = getDb();
  const c = await getCampaignRow(ctx, id, db);
  if (c.status === "publicada" || c.status === "agendada") throw new AppError("validation", "Retire a campanha da vitrine (ou cancele o agendamento) antes de excluir.");
  await db.update(schema.campaigns).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.delete", entityType: "campaign", entityId: id, summary: `Campanha "${c.name}" excluída.` });
  return { ok: true };
}

