import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { describeOffer, offerSchema, type Offer, type Unit } from "@/domain/offer";
import { getDb, schema } from "../db";
import { signedAssetUrl } from "../assets";
import type { CampaignSnapshot } from "./campaign-state";

// Vitrine pública: SOMENTE o instantâneo publicado (publishedVersion), dentro da validade.
// Nunca expõe custo, produtoId interno ou dados de rascunho.

const IMAGE_TTL = 6 * 3600;

export interface StorefrontItem {
  id: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  unit: Unit | null;
  category: string | null;
  imageUrl: string | null;
  imageFit: { x: number; y: number; zoom: number };
  offer: Offer;
  offerText: string;
  highlight: boolean;
}

export interface StorefrontCampaign {
  id: string;
  version: number;
  title: string;
  subtitle: string | null;
  startsAt: string;
  endsAt: string;
  validityNote: string | null;
  items: StorefrontItem[];
}

export interface Storefront {
  store: {
    id: string; orgId: string; name: string; slug: string; segment: string; phone: string | null; whatsapp: string | null; email: string | null;
    address: Record<string, string | undefined>; socials: Record<string, string | undefined>; hours: Record<string, string | null>; hoursNote: string | null;
  };
  brand: { colors: { primary: string; secondary: string; accent: string; text: string; background: string }; logoUrl: string | null; slogan: string | null; legalText: string | null };
  isDemo: boolean;
  campaigns: StorefrontCampaign[];
}

export async function getStorefront(slug: string, now: Date = new Date()): Promise<Storefront | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const db = getDb();
  const [row] = await db.select({ store: schema.stores, brand: schema.brandKits, isDemo: schema.organizations.isDemo })
    .from(schema.stores)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.stores.orgId))
    .innerJoin(schema.brandKits, eq(schema.brandKits.id, schema.stores.brandKitId))
    .where(and(eq(schema.stores.slug, slug), isNull(schema.stores.deletedAt), eq(schema.stores.storefrontEnabled, true), isNull(schema.organizations.deletedAt)));
  if (!row) return null;
  const { store, brand } = row;

  const live = await db.select({ id: schema.campaigns.id, publishedVersion: schema.campaigns.publishedVersion }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.orgId, store.orgId), eq(schema.campaigns.storeId, store.id), isNotNull(schema.campaigns.publishedVersion),
      ne(schema.campaigns.status, "encerrada"), isNull(schema.campaigns.deletedAt)));

  const campaigns: StorefrontCampaign[] = [];
  if (live.length) {
    const snaps = await db.select().from(schema.campaignVersions).where(and(eq(schema.campaignVersions.orgId, store.orgId), inArray(schema.campaignVersions.campaignId, live.map((l) => l.id))));
    // "acabou": item pausado agora some da vitrine mesmo sem nova publicação
    const pausedRows = await db.select({ id: schema.campaignItems.id }).from(schema.campaignItems)
      .where(and(eq(schema.campaignItems.orgId, store.orgId), inArray(schema.campaignItems.campaignId, live.map((l) => l.id)), eq(schema.campaignItems.paused, true)));
    const pausedNow = new Set(pausedRows.map((r) => r.id));
    for (const l of live) {
      const v = snaps.find((s) => s.campaignId === l.id && s.version === l.publishedVersion);
      if (!v) continue;
      const snap = v.snapshot as CampaignSnapshot;
      const sc = snap.campaign;
      if (!sc.startsAt || !sc.endsAt) continue;
      if (new Date(sc.startsAt) > now || new Date(sc.endsAt) < now) continue;
      const items = [...snap.items].sort((a, b) => a.position - b.position).filter((i) => !i.paused && !pausedNow.has(i.id)).map((i): StorefrontItem => {
        const offer = offerSchema.parse(i.offer);
        return {
          id: i.id, name: i.name, brand: i.brand, sizeLabel: i.sizeLabel, unit: i.unit, category: i.category,
          imageUrl: i.imageAssetId ? signedAssetUrl(i.imageAssetId, store.orgId, IMAGE_TTL) : null,
          imageFit: i.imageFit ?? { x: 50, y: 50, zoom: 1 }, offer, offerText: describeOffer(offer, i.unit), highlight: i.highlight,
        };
      });
      campaigns.push({ id: l.id, version: v.version, title: sc.title, subtitle: sc.subtitle, startsAt: sc.startsAt, endsAt: sc.endsAt, validityNote: sc.validityNote, items });
    }
    campaigns.sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  }
  return {
    store: {
      id: store.id, orgId: store.orgId, name: store.name, slug: store.slug, segment: store.segment, phone: store.phone, whatsapp: store.whatsapp, email: store.email,
      address: store.address, socials: store.socials, hours: store.hours, hoursNote: store.hoursNote,
    },
    brand: { colors: brand.colors, logoUrl: brand.logoAssetId ? signedAssetUrl(brand.logoAssetId, store.orgId, IMAGE_TTL) : null, slogan: brand.slogan, legalText: brand.legalText },
    isDemo: row.isDemo,
    campaigns,
  };
}

// ---------------- Eventos da vitrine (contagem anônima: sem IP, sem cookie) ----------------
export type StorefrontEventKind = "view" | "whatsapp_click" | "share";

/** Origem do acesso (?utm_source= ou ?origem=), normalizada: minúsculas, [a-z0-9_.-], até 40 caracteres. */
export function normalizeSource(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || null;
}

/**
 * Registra um evento para a loja (identificada pelo slug público). A campanha só é gravada se for desta loja.
 * Devolve false quando a loja não existe/está desativada.
 */
export async function recordStorefrontEvent(slug: string, kind: StorefrontEventKind, opts: { source?: string | null; campaignId?: string | null } = {}): Promise<boolean> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return false;
  const db = getDb();
  const [store] = await db.select({ id: schema.stores.id, orgId: schema.stores.orgId }).from(schema.stores)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.stores.orgId))
    .where(and(eq(schema.stores.slug, slug), isNull(schema.stores.deletedAt), eq(schema.stores.storefrontEnabled, true), isNull(schema.organizations.deletedAt)));
  if (!store) return false;
  let campaignId: string | null = null;
  if (opts.campaignId && /^[A-Za-z0-9_-]{1,64}$/.test(opts.campaignId)) {
    const [c] = await db.select({ id: schema.campaigns.id }).from(schema.campaigns)
      .where(and(eq(schema.campaigns.id, opts.campaignId), eq(schema.campaigns.orgId, store.orgId), eq(schema.campaigns.storeId, store.id)));
    campaignId = c?.id ?? null;
  }
  await db.insert(schema.storefrontEvents).values({ orgId: store.orgId, storeId: store.id, campaignId, kind, source: normalizeSource(opts.source) });
  return true;
}
