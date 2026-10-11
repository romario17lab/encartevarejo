// Monta o RenderCampaign (dados prontos para os modelos) a partir do banco — linhas atuais ou
// instantâneo imutável de campaign_versions. NUNCA inclui custo (cost_cents).
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Executor } from "@/server/db/tx";
import { AppError, notFound } from "@/server/errors";
import { signedAssetUrl } from "@/server/assets";
import type { CampaignStatus, PieceOverrides, RenderCampaign, RenderItem } from "@/domain/campaign";
import { pieceOverridesSchema } from "@/domain/campaign";
import { FORMATS, type FormatId } from "@/domain/formats";
import { offerSchema, unitSchema, validateOffer, type Offer, type Unit } from "@/domain/offer";

export type OrgRef = { orgId: string };
export type VersionSelector = number | "current" | "published";

export interface RenderPiece { format: FormatId; enabled: boolean; overrides: PieceOverrides }
export interface OfferIssueSummary { itemId: string; name: string; level: "error" | "warning"; message: string }

export interface RenderBundle {
  orgId: string;
  campaignId: string;
  storeId: string;
  name: string;
  status: CampaignStatus;
  version: number;
  /** "snapshot" = instantâneo de campaign_versions; "live" = linhas atuais (mesma versão) */
  source: "snapshot" | "live";
  templateId: string;
  templateVersion: number;
  campaignOverrides: PieceOverrides;
  pieces: RenderPiece[];
  campaign: RenderCampaign;
  /** itens pausados (acabou): continuam nas peças impressas; só a vitrine os oculta */
  pausedItemIds: string[];
  issues: OfferIssueSummary[];
}

// ------------------------------------------------------------------ textos prontos (pt-BR)

const TZ = "America/Sao_Paulo";
const dmy = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const dm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
const yearOf = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric" }).format(d);

/** "Ofertas válidas de 10/10 a 13/10/2026 ou enquanto durarem os estoques" */
export function buildValidityText(startsAt: Date | null, endsAt: Date | null, note?: string | null): string {
  let base = "";
  if (startsAt && endsAt) {
    if (dmy(startsAt) === dmy(endsAt)) base = `Oferta válida somente em ${dmy(startsAt)}`;
    else if (yearOf(startsAt) === yearOf(endsAt)) base = `Ofertas válidas de ${dm(startsAt)} a ${dmy(endsAt)}`;
    else base = `Ofertas válidas de ${dmy(startsAt)} a ${dmy(endsAt)}`;
  } else if (startsAt) base = `Ofertas válidas a partir de ${dmy(startsAt)}`;
  else if (endsAt) base = `Ofertas válidas até ${dmy(endsAt)}`;
  const n = note?.trim();
  if (!n) return base;
  if (!base) return n.charAt(0).toUpperCase() + n.slice(1);
  return `${base} ${n}`;
}

type Address = { street?: string; number?: string; district?: string; city?: string; state?: string; zip?: string; complement?: string };
/** "Rua das Flores, 120 - Centro, Campinas/SP" */
export function formatAddressLine(a: Address | null | undefined): string | null {
  if (!a) return null;
  const street = [a.street?.trim(), a.number?.trim()].filter(Boolean).join(", ");
  const streetFull = [street, a.complement?.trim()].filter(Boolean).join(" ");
  const city = [a.city?.trim(), a.state?.trim()?.toUpperCase()].filter(Boolean).join("/");
  const parts = [streetFull, a.district?.trim(), city].filter(Boolean);
  if (!parts.length) return null;
  const [first, ...rest] = parts;
  return rest.length ? `${first} - ${rest.join(", ")}` : first!;
}

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hourLabel = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm.trim();
  const h = Number(m[1]);
  return m[2] === "00" ? `${h}h` : `${h}h${m[2]}`;
};
const rangeLabel = (v: string) => {
  const [a, b] = v.split("-");
  return b ? `${hourLabel(a)}–${hourLabel(b)}` : hourLabel(v);
};
/** "Seg a Sáb 7h–21h · Dom 7h–13h" (dias consecutivos com o mesmo horário são agrupados) */
export function formatHoursLine(hours: Record<string, string | null> | null | undefined, note?: string | null): string | null {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: Array<{ from: number; to: number; value: string }> = [];
  for (const d of order) {
    const v = hours?.[String(d)]?.trim();
    const last = groups[groups.length - 1];
    if (v && last && last.value === v && order.indexOf(last.to) === order.indexOf(d) - 1) last.to = d;
    else if (v) groups.push({ from: d, to: d, value: v });
  }
  const parts = groups.map((g) => {
    const days = g.from === g.to ? DAY_SHORT[g.from] : order.indexOf(g.to) - order.indexOf(g.from) === 1 ? `${DAY_SHORT[g.from]} e ${DAY_SHORT[g.to]}` : `${DAY_SHORT[g.from]} a ${DAY_SHORT[g.to]}`;
    return `${days} ${rangeLabel(g.value)}`;
  });
  if (note?.trim()) parts.push(note.trim());
  return parts.length ? parts.join(" · ") : null;
}

/** "(11) 99999-0000"; aceita com ou sem DDI 55. Sem padrão reconhecido, devolve o original. */
export function formatPhoneBR(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw.trim();
}

const instagramHandle = (v: string | undefined) => {
  if (!v?.trim()) return null;
  const h = v.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").replace(/^@/, "");
  return h ? `@${h}` : null;
};

// ------------------------------------------------------------------ instantâneo (formato tolerante)

type AnyRec = Record<string, unknown>;
const pick = <T = unknown>(o: AnyRec | undefined, ...keys: string[]): T | undefined => {
  if (!o) return undefined;
  for (const k of keys) if (o[k] !== undefined) return o[k] as T;
  return undefined;
};
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

interface CampaignCore {
  name: string; title: string; subtitle: string | null; startsAt: Date | null; endsAt: Date | null; validityNote: string | null;
  templateId: string; templateVersion: number; overrides: PieceOverrides;
}
interface ItemCore {
  id: string; name: string; brand: string | null; sizeLabel: string | null; unit: Unit | null; category: string | null;
  imageAssetId: string | null; imageFit: { x: number; y: number; zoom: number }; offer: Offer; highlight: boolean; position: number; paused: boolean;
}

function parseOverrides(v: unknown): PieceOverrides {
  const r = pieceOverridesSchema.safeParse(v ?? {});
  return r.success ? r.data : {};
}
function parseOffer(v: unknown): Offer {
  return offerSchema.parse(v);
}
function parseItem(raw: AnyRec, i: number): ItemCore {
  const unitRaw = pick<string>(raw, "unit");
  const unit = unitSchema.safeParse(unitRaw);
  const fit = pick<AnyRec>(raw, "imageFit", "image_fit");
  return {
    id: String(pick(raw, "id")),
    name: String(pick(raw, "name") ?? ""),
    brand: str(pick(raw, "brand")),
    sizeLabel: str(pick(raw, "sizeLabel", "size_label")),
    unit: unit.success ? unit.data : null,
    category: str(pick(raw, "category")),
    imageAssetId: str(pick(raw, "imageAssetId", "image_asset_id")),
    imageFit: fit && typeof fit.x === "number" ? { x: Number(fit.x), y: Number(fit.y), zoom: Number(fit.zoom ?? 1) } : { x: 50, y: 50, zoom: 1 },
    offer: parseOffer(pick(raw, "offer")),
    highlight: Boolean(pick(raw, "highlight")),
    position: Number(pick(raw, "position") ?? i),
    paused: Boolean(pick(raw, "paused")),
  };
}

/** Lê o instantâneo salvo em campaign_versions.snapshot ({ campaign, items, pieces }). */
export function parseSnapshot(snapshot: unknown): { campaign: Partial<CampaignCore>; items: ItemCore[]; pieces: RenderPiece[] } {
  const s = (snapshot ?? {}) as AnyRec;
  const c = (pick<AnyRec>(s, "campaign") ?? s) as AnyRec;
  const itemsRaw = (pick<AnyRec[]>(s, "items") ?? []) as AnyRec[];
  const piecesRaw = pick<unknown>(s, "pieces") ?? [];
  const pieces: RenderPiece[] = [];
  const pushPiece = (format: string, p: AnyRec) => {
    if (format in FORMATS) pieces.push({ format: format as FormatId, enabled: pick<boolean>(p, "enabled") !== false, overrides: parseOverrides(pick(p, "overrides")) });
  };
  if (Array.isArray(piecesRaw)) for (const p of piecesRaw as AnyRec[]) pushPiece(String(pick(p, "format")), p);
  else if (piecesRaw && typeof piecesRaw === "object") for (const [k, p] of Object.entries(piecesRaw as AnyRec)) pushPiece(k, (p ?? {}) as AnyRec);
  const tv = pick<number>(c, "templateVersion", "template_version");
  return {
    campaign: {
      name: str(pick(c, "name")) ?? undefined,
      title: str(pick(c, "title")) ?? undefined,
      subtitle: str(pick(c, "subtitle")),
      startsAt: toDate(pick(c, "startsAt", "starts_at")),
      endsAt: toDate(pick(c, "endsAt", "ends_at")),
      validityNote: str(pick(c, "validityNote", "validity_note")),
      templateId: str(pick(c, "templateId", "template_id")) ?? undefined,
      templateVersion: typeof tv === "number" ? tv : undefined,
      overrides: parseOverrides(pick(c, "overrides")),
    },
    items: itemsRaw.map(parseItem).sort((a, b) => a.position - b.position),
    pieces,
  };
}

// ------------------------------------------------------------------ montagem

export interface BuildOptions {
  version?: VersionSelector;
  /** validade das URLs assinadas das imagens */
  signedUrlTtlSec?: number;
  db?: Executor;
}

/** Carrega tudo o que a renderização/exportação precisa, isolado pela conta. */
export async function loadRenderBundle(ref: OrgRef, campaignId: string, opts: BuildOptions = {}): Promise<RenderBundle> {
  const db = opts.db ?? getDb();
  const ttl = opts.signedUrlTtlSec ?? 3600;
  const orgId = ref.orgId;
  const [row] = await db.select().from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.orgId, orgId), isNull(schema.campaigns.deletedAt)));
  if (!row) throw notFound("Campanha");

  const wanted = opts.version ?? "current";
  let version: number;
  if (wanted === "current") version = row.version;
  else if (wanted === "published") {
    if (row.publishedVersion == null) throw new AppError("not_found", "Esta campanha ainda não foi publicada.");
    version = row.publishedVersion;
  } else version = wanted;

  const [snap] = await db.select().from(schema.campaignVersions)
    .where(and(eq(schema.campaignVersions.campaignId, campaignId), eq(schema.campaignVersions.orgId, orgId), eq(schema.campaignVersions.version, version)));

  let core: CampaignCore;
  let items: ItemCore[];
  let pieces: RenderPiece[];
  let source: RenderBundle["source"];
  const live: CampaignCore = {
    name: row.name, title: row.title, subtitle: row.subtitle, startsAt: row.startsAt, endsAt: row.endsAt, validityNote: row.validityNote,
    templateId: row.templateId, templateVersion: row.templateVersion, overrides: parseOverrides(row.overrides),
  };
  if (snap) {
    const parsed = parseSnapshot(snap.snapshot);
    core = {
      ...live, ...Object.fromEntries(Object.entries(parsed.campaign).filter(([, v]) => v !== undefined)),
      // datas/textos ausentes no instantâneo ficam ausentes (não herdam das linhas atuais)
      subtitle: parsed.campaign.subtitle ?? null, startsAt: parsed.campaign.startsAt ?? null, endsAt: parsed.campaign.endsAt ?? null,
      validityNote: parsed.campaign.validityNote ?? null,
    } as CampaignCore;
    items = parsed.items;
    pieces = parsed.pieces;
    source = "snapshot";
  } else if (version === row.version) {
    const rows = await db.select().from(schema.campaignItems)
      .where(and(eq(schema.campaignItems.campaignId, campaignId), eq(schema.campaignItems.orgId, orgId)))
      .orderBy(asc(schema.campaignItems.position), asc(schema.campaignItems.id));
    items = rows.map((r, i) => parseItem(r as unknown as AnyRec, i));
    const pr = await db.select().from(schema.campaignPieces)
      .where(and(eq(schema.campaignPieces.campaignId, campaignId), eq(schema.campaignPieces.orgId, orgId)));
    pieces = pr.filter((p) => p.format in FORMATS).map((p) => ({ format: p.format as FormatId, enabled: p.enabled, overrides: parseOverrides(p.overrides) }));
    core = live;
    source = "live";
  } else {
    throw new AppError("not_found", `A versão ${version} desta campanha não foi encontrada.`);
  }

  const [org] = await db.select({ isDemo: schema.organizations.isDemo }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
  const [store] = await db.select().from(schema.stores).where(and(eq(schema.stores.id, row.storeId), eq(schema.stores.orgId, orgId)));
  if (!store) throw notFound("Loja");
  const [kit] = await db.select().from(schema.brandKits).where(and(eq(schema.brandKits.id, store.brandKitId), eq(schema.brandKits.orgId, orgId)));

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const socials = store.socials ?? {};
  const renderItems: RenderItem[] = items.map((it) => ({
    id: it.id, name: it.name, brand: it.brand, sizeLabel: it.sizeLabel, unit: it.unit, category: it.category,
    imageUrl: it.imageAssetId ? signedAssetUrl(it.imageAssetId, orgId, ttl) : null,
    imageFit: it.imageFit, offer: it.offer, highlight: it.highlight,
  }));

  const campaign: RenderCampaign = {
    id: row.id,
    version,
    title: core.title || "Ofertas da Semana",
    subtitle: core.subtitle,
    validityText: buildValidityText(core.startsAt, core.endsAt, core.validityNote),
    legalText: kit?.legalText?.trim() || null,
    items: renderItems,
    isDemo: Boolean(org?.isDemo),
    brand: {
      storeName: store.name,
      logoUrl: kit?.logoAssetId ? signedAssetUrl(kit.logoAssetId, orgId, ttl) : null,
      colors: kit?.colors ?? { primary: "#166534", secondary: "#facc15", accent: "#dc2626", text: "#111827", background: "#ffffff" },
      phone: formatPhoneBR(store.phone),
      whatsapp: formatPhoneBR(store.whatsapp),
      address: formatAddressLine(store.address),
      instagram: instagramHandle(socials.instagram),
      website: store.storefrontEnabled && appUrl ? `${appUrl}/loja/${store.slug}` : socials.website?.trim() || null,
      hours: formatHoursLine(store.hours, store.hoursNote),
    },
  };

  const issues: OfferIssueSummary[] = [];
  for (const it of items) for (const i of validateOffer(it.offer, { unit: it.unit })) issues.push({ itemId: it.id, name: it.name, level: i.level, message: i.message });

  return {
    orgId, campaignId, storeId: row.storeId, name: core.name, status: row.status, version, source,
    templateId: core.templateId, templateVersion: core.templateVersion, campaignOverrides: core.overrides,
    pieces, campaign, pausedItemIds: items.filter((i) => i.paused).map((i) => i.id), issues,
  };
}

/** RenderCampaign da campanha (versão atual, publicada ou específica). */
export async function buildRenderCampaign(ref: OrgRef, campaignId: string, opts: { version?: VersionSelector; signedUrlTtlSec: number; db?: Executor }): Promise<RenderCampaign> {
  return (await loadRenderBundle(ref, campaignId, opts)).campaign;
}

/** Personalização efetiva de uma peça: nível da campanha + nível do formato. */
export function effectiveOverrides(bundle: Pick<RenderBundle, "campaignOverrides" | "pieces">, format: FormatId): PieceOverrides {
  const piece = bundle.pieces.find((p) => p.format === format);
  const merged: PieceOverrides = { ...bundle.campaignOverrides, ...(piece?.overrides ?? {}) };
  if (bundle.campaignOverrides.colors || piece?.overrides.colors) merged.colors = { ...bundle.campaignOverrides.colors, ...piece?.overrides.colors };
  return merged;
}
