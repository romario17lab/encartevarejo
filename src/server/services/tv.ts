// TV da loja: telas, pareamento (código ou link secreto), programação com agendamento e o que o aparelho toca.
// Regras:
//  - toda consulta de gestão filtra por ctx.orgId e pelas lojas do membro;
//  - o aparelho se autentica com um token próprio (só o hash fica no banco); revogar apaga o hash;
//  - o player só recebe campanhas com status "publicada", no instantâneo publicado e DENTRO da validade
//    (nunca oferta vencida) e vídeos concluídos da versão publicada;
//  - agendamento avaliado em America/Sao_Paulo (src/server/tv/schedule.ts, o mesmo código roda no aparelho).
import "../zod-pt";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { customAlphabet } from "nanoid";
import { and, asc, desc, eq, inArray, isNull, isNotNull, lte } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import type { Executor } from "../db/tx";
import { AppError, notFound } from "../errors";
import { requirePermission, storeScope, getAccessibleStore, canAccessStore } from "../tenant";
import { randomToken, sha256, signToken, verifyToken } from "../signing";
import { signedAssetUrl } from "../assets";
import { storage } from "../storage";
import { writeAudit } from "../audit";
import { assertFeature, getOrgPlan } from "./plans";
import { effectiveOverrides, loadRenderBundle, parseSnapshot } from "./render-data";
import { can } from "@/domain/campaign";
import { FORMATS, type FormatId } from "@/domain/formats";
import { getTemplate } from "@/templates/registry";
import { layoutPiece } from "@/layout/engine";
import { isScheduleActive, isValidHours, spDateEnd, spDateStart, spYmd, type ScheduleRule } from "../tv/schedule";
import type { TvItem, TvOrientation, TvPlaylist } from "../tv/types";

export const TV_FEATURE = "tv";
/** caracteres sem ambiguidade na TV (sem 0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B) */
export const PAIRING_ALPHABET = "ACDEFHJKMNPQRTUVWXY3479";
export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_TTL_MS = 15 * 60_000;
export const ONLINE_WINDOW_MS = 150_000;
export const POLL_SECONDS = 45;
const MEDIA_TTL_SEC = 24 * 3600;
/** as URLs assinadas são renovadas a cada 6 h (entra na versão da programação) */
const URL_EPOCH_MS = 6 * 3600_000;
const DEFAULT_SLIDE_SECONDS = 10;
const MAX_ITEMS = 60;

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
const tvId = (p: "tvs" | "tvi") => `${p}_${nano()}`;

type ScreenRow = typeof schema.tvScreens.$inferSelect;
type PlaylistRow = typeof schema.tvPlaylistItems.$inferSelect;

export function normalizePairingCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function newPairingCode(): string {
  let s = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) s += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  return s;
}
const newDeviceToken = () => `tvd_${randomToken(32)}`;

const orientationOf = (s: ScreenRow): TvOrientation => (s.settings?.orientation === "vertical" ? "vertical" : "horizontal");
const slideSecondsOf = (s: ScreenRow) => s.settings?.slideSeconds ?? DEFAULT_SLIDE_SECONDS;
export const formatForOrientation = (o: TvOrientation): FormatId => (o === "vertical" ? "story" : "tv_horizontal");

// ======================================================================= gestão

const screenInput = z.object({
  name: z.string().trim().min(1, "Dê um nome para a tela.").max(60),
  storeId: z.string().min(1, "Escolha a loja."),
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
  slideSeconds: z.number().int().min(4, "Mínimo de 4 segundos por slide.").max(120, "Máximo de 120 segundos por slide.").default(DEFAULT_SLIDE_SECONDS),
});
const screenPatch = screenInput.omit({ storeId: true }).partial();

async function getScreenRow(ctx: TenantCtx, id: string, db: Executor = getDb()): Promise<ScreenRow> {
  const [s] = await db.select().from(schema.tvScreens).where(and(eq(schema.tvScreens.id, id), eq(schema.tvScreens.orgId, ctx.orgId)));
  if (!s || !canAccessStore(ctx, s.storeId)) throw notFound("Tela");
  return s;
}

function presentScreen(ctx: TenantCtx, s: ScreenRow, storeName: string | null, itemCount: number, now = new Date()) {
  const write = can(ctx.role, "campaigns.write");
  const codeValid = !!s.pairingCode && !!s.pairingExpiresAt && s.pairingExpiresAt > now;
  return {
    id: s.id, name: s.name, storeId: s.storeId, storeName, orientation: orientationOf(s), slideSeconds: slideSecondsOf(s),
    paired: !!s.deviceTokenHash, pairedAt: s.pairedAt, lastSeenAt: s.lastSeenAt, revokedAt: s.revokedAt,
    online: !!s.deviceTokenHash && !!s.lastSeenAt && now.getTime() - s.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    pairingCode: write && codeValid ? s.pairingCode : null,
    pairingExpiresAt: write && codeValid ? s.pairingExpiresAt : null,
    itemCount, createdAt: s.createdAt,
  };
}
export type ScreenView = ReturnType<typeof presentScreen>;

async function hasTvFeature(orgId: string) {
  const plan = await getOrgPlan(orgId);
  return { included: plan.limits.features.includes(TV_FEATURE), planName: plan.name };
}

export async function listScreens(ctx: TenantCtx, now = new Date()) {
  requirePermission(ctx, "campaigns.read");
  const db = getDb();
  const rows = await db.select({ s: schema.tvScreens, storeName: schema.stores.name }).from(schema.tvScreens)
    .innerJoin(schema.stores, and(eq(schema.stores.id, schema.tvScreens.storeId), eq(schema.stores.orgId, schema.tvScreens.orgId)))
    .where(and(eq(schema.tvScreens.orgId, ctx.orgId), isNull(schema.stores.deletedAt), storeScope(ctx, schema.tvScreens.storeId)))
    .orderBy(asc(schema.stores.name), asc(schema.tvScreens.name));
  const counts = rows.length ? await db.select({ screenId: schema.tvPlaylistItems.screenId }).from(schema.tvPlaylistItems)
    .where(and(eq(schema.tvPlaylistItems.orgId, ctx.orgId), inArray(schema.tvPlaylistItems.screenId, rows.map((r) => r.s.id)))) : [];
  const countOf = (id: string) => counts.filter((c) => c.screenId === id).length;
  const stores = await db.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores)
    .where(and(eq(schema.stores.orgId, ctx.orgId), isNull(schema.stores.deletedAt), storeScope(ctx, schema.stores.id))).orderBy(asc(schema.stores.name));
  const feature = await hasTvFeature(ctx.orgId);
  return {
    screens: rows.map((r) => presentScreen(ctx, r.s, r.storeName, countOf(r.s.id), now)),
    stores,
    feature: {
      included: feature.included,
      message: feature.included ? null : `O recurso "TV da loja" não está incluído no plano ${feature.planName}. Altere o plano para usar.`,
    },
    canWrite: can(ctx.role, "campaigns.write"),
  };
}

/** Grava um código de pareamento novo (único) com validade de 15 minutos. */
async function assignPairingCode(db: Executor, screenId: string, orgId: string, now: Date): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newPairingCode();
    try {
      await db.update(schema.tvScreens).set({ pairingCode: code, pairingExpiresAt: expiresAt, updatedAt: now })
        .where(and(eq(schema.tvScreens.id, screenId), eq(schema.tvScreens.orgId, orgId)));
      return { code, expiresAt };
    } catch (e) {
      if ((e as { code?: string; cause?: { code?: string } })?.code !== "23505" && (e as { cause?: { code?: string } })?.cause?.code !== "23505") throw e;
      // colisão com código de outra tela: libera códigos vencidos e tenta outro
      await db.update(schema.tvScreens).set({ pairingCode: null, pairingExpiresAt: null })
        .where(and(isNotNull(schema.tvScreens.pairingCode), lte(schema.tvScreens.pairingExpiresAt, now)));
    }
  }
  throw new AppError("internal", "Não foi possível gerar um código de pareamento. Tente de novo.");
}

export async function createScreen(ctx: TenantCtx, raw: unknown, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  await assertFeature(ctx.orgId, TV_FEATURE);
  const input = screenInput.parse(raw);
  const db = getDb();
  const store = await getAccessibleStore(ctx, input.storeId, db);
  const id = tvId("tvs");
  await db.insert(schema.tvScreens).values({
    id, orgId: ctx.orgId, storeId: store.id, name: input.name,
    settings: { orientation: input.orientation, slideSeconds: input.slideSeconds },
  });
  await assignPairingCode(db, id, ctx.orgId, now);
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "tv.create", entityType: "tv_screen", entityId: id, summary: `Tela de TV "${input.name}" criada.`, data: { storeId: store.id } });
  return presentScreen(ctx, await getScreenRow(ctx, id, db), store.name, 0, now);
}

export async function updateScreen(ctx: TenantCtx, id: string, raw: unknown, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  await assertFeature(ctx.orgId, TV_FEATURE);
  const input = screenPatch.parse(raw);
  const db = getDb();
  const s = await getScreenRow(ctx, id, db);
  const settings = { ...s.settings };
  if (input.orientation) settings.orientation = input.orientation;
  if (input.slideSeconds) settings.slideSeconds = input.slideSeconds;
  await db.update(schema.tvScreens).set({ name: input.name ?? s.name, settings, updatedAt: now }).where(and(eq(schema.tvScreens.id, id), eq(schema.tvScreens.orgId, ctx.orgId)));
  return getScreenDetail(ctx, id, now);
}

export async function deleteScreen(ctx: TenantCtx, id: string) {
  requirePermission(ctx, "campaigns.write");
  const db = getDb();
  const s = await getScreenRow(ctx, id, db);
  await db.delete(schema.tvScreens).where(and(eq(schema.tvScreens.id, id), eq(schema.tvScreens.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "tv.delete", entityType: "tv_screen", entityId: id, summary: `Tela de TV "${s.name}" excluída.` });
  return { ok: true };
}

/** Novo código de pareamento (o anterior deixa de valer). O aparelho já pareado continua até parear outro. */
export async function regeneratePairing(ctx: TenantCtx, id: string, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  await assertFeature(ctx.orgId, TV_FEATURE);
  const db = getDb();
  await getScreenRow(ctx, id, db);
  const r = await assignPairingCode(db, id, ctx.orgId, now);
  return { pairingCode: r.code, pairingExpiresAt: r.expiresAt };
}

/**
 * Player por link: gera um token de aparelho novo e devolve o caminho secreto /tv/l/<token>.
 * Mostrado UMA vez (só o hash fica guardado). Substitui o aparelho pareado antes (uma tela = um acesso).
 */
export async function createScreenLink(ctx: TenantCtx, id: string, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  await assertFeature(ctx.orgId, TV_FEATURE);
  const db = getDb();
  const s = await getScreenRow(ctx, id, db);
  const token = newDeviceToken();
  await db.update(schema.tvScreens).set({ deviceTokenHash: sha256(token), pairedAt: now, revokedAt: null, pairingCode: null, pairingExpiresAt: null, lastSeenAt: null, updatedAt: now })
    .where(and(eq(schema.tvScreens.id, id), eq(schema.tvScreens.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "tv.link", entityType: "tv_screen", entityId: id, summary: `Link do player gerado para a tela "${s.name}".` });
  return { path: `/tv/l/${token}` };
}

/** Desconecta o aparelho (ou link): ele para na próxima sincronização. */
export async function revokeScreen(ctx: TenantCtx, id: string, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  const db = getDb();
  const s = await getScreenRow(ctx, id, db);
  await db.update(schema.tvScreens).set({ deviceTokenHash: null, pairingCode: null, pairingExpiresAt: null, revokedAt: now, updatedAt: now })
    .where(and(eq(schema.tvScreens.id, id), eq(schema.tvScreens.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "tv.revoke", entityType: "tv_screen", entityId: id, summary: `Aparelho da tela "${s.name}" desconectado.` });
  return { ok: true };
}

// ---------------- programação

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const playlistItemInput = z.object({
  kind: z.enum(["campaign", "video"]),
  campaignId: z.string().max(64).nullish(),
  videoJobId: z.string().max(64).nullish(),
  durationSec: z.number().int().min(3, "Duração mínima de 3 segundos.").max(600, "Duração máxima de 600 segundos.").nullish(),
  startDate: ymd.nullish(),
  endDate: ymd.nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  hours: z.string().trim().max(60).nullish(),
});
const playlistInput = z.object({ items: z.array(playlistItemInput).max(MAX_ITEMS, `No máximo ${MAX_ITEMS} itens por tela.`) });

export async function savePlaylist(ctx: TenantCtx, id: string, raw: unknown, now = new Date()) {
  requirePermission(ctx, "campaigns.write");
  await assertFeature(ctx.orgId, TV_FEATURE);
  const input = playlistInput.parse(raw);
  const db = getDb();
  const screen = await getScreenRow(ctx, id, db);
  const campaignIds = [...new Set(input.items.map((i) => i.campaignId).filter((v): v is string => !!v))];
  const videoIds = [...new Set(input.items.map((i) => i.videoJobId).filter((v): v is string => !!v))];
  const camps = campaignIds.length ? await db.select().from(schema.campaigns)
    .where(and(eq(schema.campaigns.orgId, ctx.orgId), inArray(schema.campaigns.id, campaignIds), isNull(schema.campaigns.deletedAt))) : [];
  const videos = videoIds.length ? await db.select().from(schema.videoJobs)
    .where(and(eq(schema.videoJobs.orgId, ctx.orgId), inArray(schema.videoJobs.id, videoIds))) : [];
  const videoCamps = videos.length ? await db.select({ id: schema.campaigns.id, storeId: schema.campaigns.storeId }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.orgId, ctx.orgId), inArray(schema.campaigns.id, videos.map((v) => v.campaignId)))) : [];

  const rows: Array<typeof schema.tvPlaylistItems.$inferInsert> = input.items.map((it, i) => {
    const n = i + 1;
    let campaignId: string | null = null;
    let videoJobId: string | null = null;
    if (it.kind === "campaign") {
      const c = camps.find((x) => x.id === it.campaignId);
      if (!c) throw new AppError("validation", `Item ${n}: campanha não encontrada.`);
      if (c.storeId !== screen.storeId) throw new AppError("validation", `Item ${n}: a campanha "${c.name}" é de outra loja.`);
      if (!["publicada", "agendada"].includes(c.status)) throw new AppError("validation", `Item ${n}: só campanhas publicadas ou agendadas podem ir para a TV.`);
      campaignId = c.id;
    } else {
      const v = videos.find((x) => x.id === it.videoJobId);
      if (!v) throw new AppError("validation", `Item ${n}: vídeo não encontrado.`);
      if (v.status !== "concluida" || !v.outputAssetId) throw new AppError("validation", `Item ${n}: o vídeo ainda não está pronto.`);
      if (videoCamps.find((c) => c.id === v.campaignId)?.storeId !== screen.storeId) throw new AppError("validation", `Item ${n}: o vídeo é de uma campanha de outra loja.`);
      videoJobId = v.id;
      campaignId = v.campaignId;
    }
    const hours = it.hours?.trim() || null;
    if (hours && !isValidHours(hours)) throw new AppError("validation", `Item ${n}: horário inválido. Use o formato 08:00-12:00 (várias faixas separadas por vírgula).`);
    const startsAt = it.startDate ? spDateStart(it.startDate) : null;
    const endsAt = it.endDate ? spDateEnd(it.endDate) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new AppError("validation", `Item ${n}: a data final é anterior à inicial.`);
    const days = it.daysOfWeek && it.daysOfWeek.length && it.daysOfWeek.length < 7 ? [...new Set(it.daysOfWeek)].sort() : null;
    if (it.daysOfWeek && it.daysOfWeek.length === 0) throw new AppError("validation", `Item ${n}: escolha pelo menos um dia da semana.`);
    return {
      id: tvId("tvi"), orgId: ctx.orgId, screenId: id, kind: it.kind, campaignId, videoJobId, position: i,
      durationSec: it.durationSec ?? null, startsAt, endsAt, daysOfWeek: days, hours,
    };
  });
  await db.transaction(async (tx) => {
    await tx.delete(schema.tvPlaylistItems).where(and(eq(schema.tvPlaylistItems.screenId, id), eq(schema.tvPlaylistItems.orgId, ctx.orgId)));
    if (rows.length) await tx.insert(schema.tvPlaylistItems).values(rows);
    await tx.update(schema.tvScreens).set({ updatedAt: now }).where(eq(schema.tvScreens.id, id));
    await writeAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "tv.playlist", entityType: "tv_screen", entityId: id, summary: `Programação da tela "${screen.name}" atualizada (${rows.length} ite${rows.length === 1 ? "m" : "ns"}).` });
  });
  return getScreenDetail(ctx, id, now);
}

const SKIP_LABEL: Record<SkipReason, string> = {
  not_published: "Campanha não está publicada",
  expired: "Validade encerrada",
  not_started: "Validade ainda não começou",
  schedule_over: "Período da programação encerrado",
  no_items: "Campanha sem produtos ativos",
  missing: "Item excluído",
  template: "Modelo indisponível",
  video_pending: "Vídeo não está pronto",
  video_outdated: "Vídeo de uma versão antiga da campanha",
  wrong_store: "Item de outra loja",
};

export async function getScreenDetail(ctx: TenantCtx, id: string, now = new Date()) {
  requirePermission(ctx, "campaigns.read");
  const db = getDb();
  const s = await getScreenRow(ctx, id, db);
  const [store] = await db.select({ name: schema.stores.name }).from(schema.stores).where(and(eq(schema.stores.id, s.storeId), eq(schema.stores.orgId, ctx.orgId)));
  const rows = await db.select().from(schema.tvPlaylistItems)
    .where(and(eq(schema.tvPlaylistItems.screenId, id), eq(schema.tvPlaylistItems.orgId, ctx.orgId))).orderBy(asc(schema.tvPlaylistItems.position));
  const built = await buildPlaylistFor(s, store?.name ?? "", rows, now);
  const playing = new Set(built.items.map((i) => i.id));
  const later = new Set(built.upcoming.map((i) => i.id));

  // candidatas: campanhas publicadas/agendadas desta loja ainda não vencidas, e vídeos concluídos delas
  const camps = await db.select().from(schema.campaigns).where(and(
    eq(schema.campaigns.orgId, ctx.orgId), eq(schema.campaigns.storeId, s.storeId), isNull(schema.campaigns.deletedAt),
    inArray(schema.campaigns.status, ["publicada", "agendada"]))).orderBy(desc(schema.campaigns.updatedAt));
  const allCampIds = [...new Set([...camps.map((c) => c.id), ...rows.map((r) => r.campaignId).filter((v): v is string => !!v)])];
  const campNames = allCampIds.length ? await db.select({ id: schema.campaigns.id, name: schema.campaigns.name, status: schema.campaigns.status, startsAt: schema.campaigns.startsAt, endsAt: schema.campaigns.endsAt })
    .from(schema.campaigns).where(and(eq(schema.campaigns.orgId, ctx.orgId), inArray(schema.campaigns.id, allCampIds))) : [];
  const videos = camps.length ? await db.select().from(schema.videoJobs).where(and(
    eq(schema.videoJobs.orgId, ctx.orgId), inArray(schema.videoJobs.campaignId, camps.map((c) => c.id)), eq(schema.videoJobs.status, "concluida"), isNotNull(schema.videoJobs.outputAssetId)))
    .orderBy(desc(schema.videoJobs.createdAt)) : [];
  const nameOf = (cid: string | null) => campNames.find((c) => c.id === cid)?.name ?? "Campanha excluída";

  return {
    screen: presentScreen(ctx, s, store?.name ?? null, rows.length, now),
    items: rows.map((r) => {
      const skip = built.skipped.find((k) => k.id === r.id);
      return {
        id: r.id, kind: r.kind, campaignId: r.campaignId, videoJobId: r.videoJobId,
        name: r.kind === "video" ? `Vídeo · ${nameOf(r.campaignId)}` : nameOf(r.campaignId),
        durationSec: r.durationSec,
        startDate: r.startsAt ? spYmd(r.startsAt) : null,
        endDate: r.endsAt ? spYmd(new Date(r.endsAt.getTime() - 1)) : null,
        daysOfWeek: r.daysOfWeek ?? null, hours: r.hours,
        state: playing.has(r.id) ? "no_ar" as const : later.has(r.id) ? "agendado" as const : "fora" as const,
        reason: skip ? SKIP_LABEL[skip.reason] : null,
      };
    }),
    candidates: {
      campaigns: camps.filter((c) => !c.endsAt || c.endsAt > now).map((c) => ({ id: c.id, name: c.name, status: c.status, startsAt: c.startsAt, endsAt: c.endsAt })),
      videos: videos.map((v) => ({ id: v.id, campaignId: v.campaignId, name: `Vídeo · ${nameOf(v.campaignId)}`, orientation: v.orientation, durationSec: v.durationSec, createdAt: v.createdAt })),
    },
  };
}

/** Prévia do que toca agora (mesma montagem que o aparelho recebe). */
export async function previewScreen(ctx: TenantCtx, id: string, now = new Date()): Promise<TvPlaylist> {
  requirePermission(ctx, "campaigns.read");
  const s = await getScreenRow(ctx, id);
  return devicePayload(s, now);
}

// ======================================================================= aparelho

/** Pareamento pelo código mostrado na gestão. Uso único, validade de 15 min. */
export async function pairDevice(rawCode: unknown, now = new Date()) {
  const code = normalizePairingCode(String(rawCode ?? ""));
  const invalid = () => new AppError("not_found", "Código inválido ou vencido. Confira o código na tela de gestão ou gere um novo.");
  if (code.length !== PAIRING_CODE_LENGTH || [...code].some((c) => !PAIRING_ALPHABET.includes(c))) throw invalid();
  const db = getDb();
  const token = newDeviceToken();
  const screen = await db.transaction(async (tx) => {
    const [s] = await tx.select().from(schema.tvScreens).where(eq(schema.tvScreens.pairingCode, code)).for("update");
    if (!s || !s.pairingExpiresAt || s.pairingExpiresAt <= now) throw invalid();
    await assertFeature(s.orgId, TV_FEATURE, tx);
    await assertDeviceOrg(s, tx);
    await tx.update(schema.tvScreens).set({ deviceTokenHash: sha256(token), pairingCode: null, pairingExpiresAt: null, pairedAt: now, revokedAt: null, lastSeenAt: now, updatedAt: now })
      .where(eq(schema.tvScreens.id, s.id));
    await writeAudit(tx, { orgId: s.orgId, userId: null, action: "tv.pair", entityType: "tv_screen", entityId: s.id, summary: `Aparelho pareado com a tela "${s.name}".` });
    return s;
  });
  return { token, screen: { id: screen.id, name: screen.name } };
}

async function assertDeviceOrg(s: ScreenRow, db: Executor = getDb()) {
  const [org] = await db.select({ deletedAt: schema.organizations.deletedAt, suspendedAt: schema.organizations.suspendedAt }).from(schema.organizations).where(eq(schema.organizations.id, s.orgId));
  if (!org || org.deletedAt) throw new AppError("unauthenticated", "Esta tela foi desconectada.");
  if (org.suspendedAt) throw new AppError("forbidden", "Esta conta está suspensa. Fale com o responsável pela loja.");
}

const DEVICE_UNAUTH = "Esta tela foi desconectada. Faça o pareamento de novo.";

/** Autentica o aparelho pelo token (cabeçalho Authorization: Bearer). */
export async function authDevice(token: string | null | undefined): Promise<ScreenRow> {
  if (!token || !token.startsWith("tvd_") || token.length > 200) throw new AppError("unauthenticated", DEVICE_UNAUTH);
  const [s] = await getDb().select().from(schema.tvScreens).where(eq(schema.tvScreens.deviceTokenHash, sha256(token)));
  if (!s) throw new AppError("unauthenticated", DEVICE_UNAUTH);
  return s;
}

export function bearer(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1]! : null;
}

/** GET /api/tv/playlist: heartbeat + programação com versão (ETag). */
export async function devicePlaylist(token: string | null, ifNoneMatch: string | null, now = new Date()): Promise<{ notModified: boolean; etag: string; body: TvPlaylist }> {
  const s = await authDevice(token);
  await assertDeviceOrg(s);
  await assertFeature(s.orgId, TV_FEATURE);
  await getDb().update(schema.tvScreens).set({ lastSeenAt: now }).where(eq(schema.tvScreens.id, s.id));
  const body = await devicePayload(s, now);
  const etag = `"${body.version}"`;
  const tags = (ifNoneMatch ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  return { notModified: tags.includes(etag), etag, body };
}

async function devicePayload(s: ScreenRow, now: Date): Promise<TvPlaylist> {
  const db = getDb();
  const [store] = await db.select({ name: schema.stores.name, deletedAt: schema.stores.deletedAt }).from(schema.stores).where(and(eq(schema.stores.id, s.storeId), eq(schema.stores.orgId, s.orgId)));
  const rows = store && !store.deletedAt ? await db.select().from(schema.tvPlaylistItems)
    .where(and(eq(schema.tvPlaylistItems.screenId, s.id), eq(schema.tvPlaylistItems.orgId, s.orgId))).orderBy(asc(schema.tvPlaylistItems.position)) : [];
  const built = await buildPlaylistFor(s, store?.name ?? "", rows, now);
  const screen = { id: s.id, name: s.name, storeName: store?.name ?? "", orientation: orientationOf(s), slideSeconds: slideSecondsOf(s) };
  // versão: conteúdo estável (sem os tokens das URLs assinadas) + época de renovação das URLs
  const stable = JSON.stringify({ screen, items: built.items, upcoming: built.upcoming }).replace(/\?t=[^"]*/g, "");
  const version = sha256(`${stable}|${Math.floor(now.getTime() / URL_EPOCH_MS)}`).slice(0, 24);
  return { version, serverTime: now.toISOString(), pollSeconds: POLL_SECONDS, screen, items: built.items, upcoming: built.upcoming };
}

type SkipReason = "not_published" | "expired" | "not_started" | "schedule_over" | "no_items" | "missing" | "template" | "video_pending" | "video_outdated" | "wrong_store";

const minIso = (...d: Array<Date | null | undefined>) => {
  const v = d.filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime())[0];
  return v ? v.toISOString() : null;
};
const maxIso = (...d: Array<Date | null | undefined>) => {
  const v = d.filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0];
  return v ? v.toISOString() : null;
};

/**
 * Monta a programação de uma tela: itens válidos, divididos em "toca agora" e "mais tarde".
 * Campanha: status publicada + instantâneo publicado + agora dentro de [início, fim) da validade.
 */
async function buildPlaylistFor(s: ScreenRow, _storeName: string, rows: PlaylistRow[], now: Date) {
  const db = getDb();
  const orgId = s.orgId;
  const orientation = orientationOf(s);
  const format = FORMATS[formatForOrientation(orientation)];
  const items: TvItem[] = [];
  const upcoming: TvItem[] = [];
  const skipped: Array<{ id: string; reason: SkipReason }> = [];

  const campIds = [...new Set(rows.map((r) => r.campaignId).filter((v): v is string => !!v))];
  const camps = campIds.length ? await db.select().from(schema.campaigns)
    .where(and(eq(schema.campaigns.orgId, orgId), inArray(schema.campaigns.id, campIds), isNull(schema.campaigns.deletedAt))) : [];
  const videoIds = rows.map((r) => r.videoJobId).filter((v): v is string => !!v);
  const videos = videoIds.length ? await db.select().from(schema.videoJobs).where(and(eq(schema.videoJobs.orgId, orgId), inArray(schema.videoJobs.id, videoIds))) : [];
  const snaps = camps.length ? await db.select().from(schema.campaignVersions).where(and(eq(schema.campaignVersions.orgId, orgId), inArray(schema.campaignVersions.campaignId, camps.map((c) => c.id)))) : [];
  const pausedRows = camps.length ? await db.select({ id: schema.campaignItems.id }).from(schema.campaignItems)
    .where(and(eq(schema.campaignItems.orgId, orgId), inArray(schema.campaignItems.campaignId, camps.map((c) => c.id)), eq(schema.campaignItems.paused, true))) : [];
  const pausedNow = new Set(pausedRows.map((r) => r.id));
  const bundles = new Map<string, Awaited<ReturnType<typeof loadRenderBundle>>>();

  /** validade publicada da campanha (instantâneo), ou motivo para não tocar */
  const validity = (cid: string): { from: Date; until: Date; camp: typeof camps[number] } | SkipReason => {
    const c = camps.find((x) => x.id === cid);
    if (!c) return "missing";
    if (c.storeId !== s.storeId) return "wrong_store";
    if (c.status !== "publicada" || c.publishedVersion == null) return "not_published";
    const snap = snaps.find((v) => v.campaignId === cid && v.version === c.publishedVersion);
    if (!snap) return "not_published";
    const parsed = parseSnapshot(snap.snapshot).campaign;
    if (!parsed.startsAt || !parsed.endsAt) return "not_published";
    if (parsed.endsAt <= now) return "expired";
    return { from: parsed.startsAt, until: parsed.endsAt, camp: c };
  };

  for (const r of rows) {
    const skip = (reason: SkipReason) => skipped.push({ id: r.id, reason });
    if (!r.campaignId) { skip("missing"); continue; }
    const v = validity(r.campaignId);
    if (typeof v === "string") { skip(v); continue; }
    if (r.endsAt && r.endsAt <= now) { skip("schedule_over"); continue; }
    const schedule: ScheduleRule = { startsAt: maxIso(r.startsAt, v.from), endsAt: minIso(r.endsAt, v.until), daysOfWeek: r.daysOfWeek ?? null, hours: r.hours ?? null };
    const base = { id: r.id, position: r.position, schedule, validFrom: maxIso(r.startsAt, v.from), validUntil: minIso(r.endsAt, v.until) };
    let item: TvItem;
    if (r.kind === "video") {
      const job = videos.find((j) => j.id === r.videoJobId);
      if (!job || job.campaignId !== r.campaignId) { skip("missing"); continue; }
      if (job.status !== "concluida" || !job.outputAssetId) { skip("video_pending"); continue; }
      if (job.campaignVersion !== v.camp.publishedVersion) { skip("video_outdated"); continue; }
      const t = signToken({ aid: job.outputAssetId, org: orgId, scr: s.id }, MEDIA_TTL_SEC);
      item = {
        ...base, kind: "video", videoJobId: job.id, campaignId: r.campaignId, name: `Vídeo · ${v.camp.name}`,
        url: `/api/tv/media/${encodeURIComponent(job.outputAssetId)}?t=${encodeURIComponent(t)}`,
        orientation: job.orientation, maxSeconds: r.durationSec ?? null, durationSec: job.durationSec,
      };
    } else {
      let bundle = bundles.get(r.campaignId);
      if (!bundle) {
        bundle = await loadRenderBundle({ orgId }, r.campaignId, { version: "published", signedUrlTtlSec: MEDIA_TTL_SEC });
        bundles.set(r.campaignId, bundle);
      }
      const template = getTemplate(bundle.templateId, bundle.templateVersion);
      if (!template) { skip("template"); continue; }
      // item pausado ("acabou") sai da TV na hora, como na vitrine
      const paused = new Set([...bundle.pausedItemIds, ...pausedNow]);
      const campaign = { ...bundle.campaign, items: bundle.campaign.items.filter((i) => !paused.has(i.id)) };
      if (!campaign.items.length) { skip("no_items"); continue; }
      const overrides = effectiveOverrides(bundle, format.id);
      const layout = layoutPiece({ campaign, format, template, overrides });
      if (!layout.pages.length) { skip("no_items"); continue; }
      item = {
        ...base, kind: "campaign", campaignId: r.campaignId, name: v.camp.name, campaign,
        templateId: bundle.templateId, templateVersion: bundle.templateVersion, format: format.id, overrides,
        pages: layout.pages.length, slideSeconds: r.durationSec ?? slideSecondsOf(s),
      };
    }
    if (isScheduleActive(schedule, now)) items.push(item);
    else upcoming.push(item);
  }
  return { items, upcoming, skipped };
}

// ---------------- mídia (vídeo) para o aparelho

/** Lê o arquivo de vídeo/imagem autorizado pelo token assinado da programação (tela ainda conectada). */
export async function readTvMedia(assetId: string, token: string | null) {
  const data = verifyToken<{ aid: string; org: string; scr: string }>(token);
  if (!data || data.aid !== assetId || typeof data.org !== "string" || typeof data.scr !== "string") throw new AppError("unauthenticated", "Link de mídia inválido ou vencido.");
  const db = getDb();
  const [s] = await db.select({ id: schema.tvScreens.id }).from(schema.tvScreens)
    .where(and(eq(schema.tvScreens.id, data.scr), eq(schema.tvScreens.orgId, data.org), isNotNull(schema.tvScreens.deviceTokenHash)));
  if (!s) throw new AppError("unauthenticated", DEVICE_UNAUTH);
  const [a] = await db.select().from(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, data.org)));
  if (!a || (a.kind !== "video" && a.kind !== "image")) throw notFound("Arquivo");
  const bytes = await storage.get(a.storageKey).catch(() => { throw notFound("Arquivo"); });
  return { asset: a, data: bytes, exp: data.exp };
}
