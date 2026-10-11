import "../zod-pt";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { TenantCtx } from "../context";
import { getDb, schema } from "../db";
import { AppError, notFound } from "../errors";
import { writeAudit } from "../audit";
import { appUrl, sendEmail } from "../email";
import { randomToken, sha256, signToken, verifyToken } from "../signing";
import { hashPassword, verifyPassword } from "../auth/password";
import { requirePermission } from "../tenant";
import { getCampaignRow } from "./campaigns";
import { effectiveOverrides, loadRenderBundle } from "./render-data";

// Links de prévia para aprovação externa (agência → cliente, ou loja → dono).
// - O link aponta para UMA versão da campanha (campaign_version). Se a campanha mudar depois, a página pública
//   avisa que a prévia está desatualizada e não aceita decisão.
// - Validade de 1 a 30 dias (padrão 7). PIN opcional de 4 a 6 dígitos (guardado com bcrypt); 5 PINs errados em
//   15 minutos bloqueiam o link por 15 minutos (contagem persistida no registro de auditoria da conta).
// - Só o sha256 do token fica no banco; o link completo é mostrado uma única vez, na criação.
// - A decisão do cliente (aprovado / pedir alterações) é um REGISTRO de concordância. O fluxo interno continua:
//   um aprovador da conta aprova no aplicativo.

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
const linkId = () => `pvl_${nano()}`;

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
const MAX_ACTIVE_LINKS_PER_CAMPAIGN = 20;
export const PREVIEW_PIN_COOKIE = (id: string) => `ev_pv_${id.replace(/[^a-z0-9_]/gi, "")}`;
const PIN_COOKIE_TTL_SEC = 12 * 3600;

type LinkRow = typeof schema.previewLinks.$inferSelect;

export const createPreviewLinkSchema = z.object({
  days: z.number().int("Use um número inteiro de dias.").min(1, "A validade mínima é 1 dia.").max(30, "A validade máxima é 30 dias.").default(7),
  pin: z.string().trim().regex(/^\d{4,6}$/, "O PIN deve ter de 4 a 6 números.").optional().or(z.literal("").transform(() => undefined)),
});

export type PreviewLinkStatus = "ativo" | "expirado" | "revogado" | "aprovado" | "alteracoes" | "desatualizado";

function linkStatus(l: LinkRow, currentVersion: number | null, now = new Date()): PreviewLinkStatus {
  if (l.decision) return l.decision;
  if (l.revokedAt) return "revogado";
  if (l.expiresAt.getTime() <= now.getTime()) return "expirado";
  if (currentVersion !== null && currentVersion !== l.campaignVersion) return "desatualizado";
  return "ativo";
}

/** Cria o link de prévia da versão ATUAL da campanha. O token só é devolvido aqui. */
export async function createPreviewLink(ctx: TenantCtx, campaignId: string, raw: unknown, now = new Date()) {
  requirePermission(ctx, "campaigns.submit");
  const input = createPreviewLinkSchema.parse(raw ?? {});
  const db = getDb();
  const c = await getCampaignRow(ctx, campaignId, db);
  const [{ n }] = await db.select({ n: count() }).from(schema.previewLinks).where(and(eq(schema.previewLinks.orgId, ctx.orgId), eq(schema.previewLinks.campaignId, campaignId),
    isNull(schema.previewLinks.revokedAt), isNull(schema.previewLinks.decision), gt(schema.previewLinks.expiresAt, now))) as [{ n: number }];
  if (n >= MAX_ACTIVE_LINKS_PER_CAMPAIGN) throw new AppError("limit_reached", `Esta campanha já tem ${n} links ativos. Revogue os antigos antes de criar outro.`);
  const token = randomToken(24);
  const id = linkId();
  const expiresAt = new Date(now.getTime() + input.days * 24 * 3600 * 1000);
  await db.insert(schema.previewLinks).values({
    id, orgId: ctx.orgId, campaignId, campaignVersion: c.version, tokenHash: sha256(token),
    pinHash: input.pin ? await hashPassword(input.pin) : null, expiresAt, createdBy: ctx.userId, createdAt: now,
  });
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.preview_link_create", entityType: "campaign", entityId: campaignId,
    summary: `Link de prévia para aprovação do cliente criado (versão ${c.version}, válido por ${input.days} dia${input.days > 1 ? "s" : ""}${input.pin ? ", com PIN" : ""}).`,
    data: { linkId: id, version: c.version, days: input.days, withPin: !!input.pin } });
  return { id, url: appUrl(`/aprovar/${token}`), expiresAt, campaignVersion: c.version, hasPin: !!input.pin };
}

export async function listPreviewLinks(ctx: TenantCtx, campaignId: string, now = new Date()) {
  requirePermission(ctx, "campaigns.read");
  const db = getDb();
  const c = await getCampaignRow(ctx, campaignId, db);
  const rows = await db.select({ link: schema.previewLinks, createdByName: schema.users.name }).from(schema.previewLinks)
    .leftJoin(schema.users, eq(schema.users.id, schema.previewLinks.createdBy))
    .where(and(eq(schema.previewLinks.orgId, ctx.orgId), eq(schema.previewLinks.campaignId, campaignId)))
    .orderBy(desc(schema.previewLinks.createdAt));
  const links = rows.map(({ link: l, createdByName }) => ({
    id: l.id, campaignVersion: l.campaignVersion, expiresAt: l.expiresAt, revokedAt: l.revokedAt, viewCount: l.viewCount,
    decision: l.decision, decidedAt: l.decidedAt, decidedName: l.decidedName, comment: l.comment, createdAt: l.createdAt,
    createdByName, hasPin: !!l.pinHash, status: linkStatus(l, c.version, now), outdated: l.campaignVersion !== c.version,
  }));
  // decisão externa mais recente sobre a versão atual (para mostrar ao aprovador interno)
  const currentDecision = links.find((l) => l.decision && l.campaignVersion === c.version) ?? null;
  return { campaignVersion: c.version, links, currentDecision };
}

export async function revokePreviewLink(ctx: TenantCtx, id: string, now = new Date()) {
  requirePermission(ctx, "campaigns.submit");
  const db = getDb();
  const [l] = await db.select().from(schema.previewLinks).where(and(eq(schema.previewLinks.id, id), eq(schema.previewLinks.orgId, ctx.orgId)));
  if (!l) throw notFound("Link de prévia");
  await getCampaignRow(ctx, l.campaignId, db); // respeita o acesso por loja
  if (l.revokedAt) return { ok: true };
  await db.update(schema.previewLinks).set({ revokedAt: now }).where(and(eq(schema.previewLinks.id, id), eq(schema.previewLinks.orgId, ctx.orgId)));
  await writeAudit(db, { orgId: ctx.orgId, userId: ctx.userId, action: "campaign.preview_link_revoke", entityType: "campaign", entityId: l.campaignId,
    summary: `Link de prévia (versão ${l.campaignVersion}) revogado.`, data: { linkId: id } });
  return { ok: true };
}

// ---------------- Acesso público ----------------

async function findByToken(token: string): Promise<LinkRow | null> {
  if (!token || token.length < 20 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const [l] = await getDb().select().from(schema.previewLinks).where(eq(schema.previewLinks.tokenHash, sha256(token)));
  return l ?? null;
}

async function recentPinFailures(l: LinkRow, now: Date): Promise<{ count: number; lastAt: Date | null }> {
  const since = new Date(now.getTime() - PIN_LOCK_MS);
  const rows = await getDb().select({ createdAt: schema.auditLog.createdAt }).from(schema.auditLog)
    .where(and(eq(schema.auditLog.orgId, l.orgId), eq(schema.auditLog.action, "preview_link.pin_failed"), eq(schema.auditLog.entityId, l.id), gt(schema.auditLog.createdAt, since)))
    .orderBy(desc(schema.auditLog.createdAt)).limit(PIN_MAX_ATTEMPTS + 1);
  return { count: rows.length, lastAt: rows[0]?.createdAt ?? null };
}

/** Cookie (assinado) que lembra que o PIN do link foi digitado corretamente neste navegador. */
export function pinCookieValue(linkIdValue: string): string {
  return signToken({ pvl: linkIdValue }, PIN_COOKIE_TTL_SEC);
}
export const PIN_COOKIE_MAX_AGE = PIN_COOKIE_TTL_SEC;
/** Cookies de PIN recebidos (um por link aberto neste navegador); vale se algum for deste link. */
export type PinCookies = string | string[] | null | undefined;
function pinCookieOk(l: LinkRow, cookies: PinCookies): boolean {
  if (!l.pinHash) return true;
  const list = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
  return list.some((c) => verifyToken<{ pvl: string }>(c)?.pvl === l.id);
}

type Gate =
  | { state: "invalid" }
  | { state: "expired" | "revoked"; link: LinkRow }
  | { state: "locked"; link: LinkRow; until: Date }
  | { state: "pin_required"; link: LinkRow }
  | { state: "ok"; link: LinkRow };

async function gate(token: string, cookie: PinCookies, now: Date): Promise<Gate> {
  const l = await findByToken(token);
  if (!l) return { state: "invalid" };
  const [org] = await getDb().select({ deletedAt: schema.organizations.deletedAt, suspendedAt: schema.organizations.suspendedAt }).from(schema.organizations).where(eq(schema.organizations.id, l.orgId));
  if (!org || org.deletedAt || org.suspendedAt) return { state: "invalid" };
  if (l.revokedAt) return { state: "revoked", link: l };
  if (l.expiresAt.getTime() <= now.getTime()) return { state: "expired", link: l };
  if (l.pinHash && !pinCookieOk(l, cookie)) {
    const f = await recentPinFailures(l, now);
    if (f.count >= PIN_MAX_ATTEMPTS && f.lastAt) return { state: "locked", link: l, until: new Date(f.lastAt.getTime() + PIN_LOCK_MS) };
    return { state: "pin_required", link: l };
  }
  return { state: "ok", link: l };
}

/** Confere o PIN. Devolve o valor do cookie a gravar. Erros contam para o bloqueio. */
export async function verifyPreviewPin(token: string, raw: unknown, now = new Date()) {
  const { pin } = z.object({ pin: z.string().trim().max(12) }).parse(raw ?? {});
  const g = await gate(token, null, now);
  if (g.state === "invalid") throw new AppError("not_found", "Link de prévia inválido.");
  if (g.state === "expired" || g.state === "revoked") throw new AppError("not_found", "Este link de prévia não está mais disponível.");
  if (g.state === "locked") throw new AppError("rate_limited", "Muitas tentativas com PIN incorreto. O link ficou bloqueado por 15 minutos.");
  const l = g.link;
  if (!l.pinHash) return { ok: true, linkId: l.id, cookie: null as string | null };
  if (/^\d{4,6}$/.test(pin) && (await verifyPassword(pin, l.pinHash))) return { ok: true, linkId: l.id, cookie: pinCookieValue(l.id) };
  await writeAudit(getDb(), { orgId: l.orgId, userId: null, action: "preview_link.pin_failed", entityType: "preview_link", entityId: l.id,
    summary: "PIN incorreto digitado no link de prévia.", data: { campaignId: l.campaignId } });
  const f = await recentPinFailures(l, now);
  const left = Math.max(0, PIN_MAX_ATTEMPTS - f.count);
  if (left === 0) throw new AppError("rate_limited", "Muitas tentativas com PIN incorreto. O link ficou bloqueado por 15 minutos.");
  throw new AppError("validation", `PIN incorreto. ${left} tentativa${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}.`);
}

export interface PublicPiece { format: string; label: string; pages: number }

export type PublicPreview =
  | { state: "invalid" | "expired" | "revoked" }
  | { state: "locked"; until: string }
  | { state: "pin_required" }
  | { state: "outdated"; storeName: string; campaignName: string }
  | {
    state: "ok"; storeName: string; campaignName: string; version: number; expiresAt: string;
    decision: null | { decision: "aprovado" | "alteracoes"; name: string; comment: string | null; at: string };
  };

/**
 * Dados da página pública. Conta uma visualização quando `countView` (página aberta com o link válido).
 * Nunca devolve ids da conta, custos, outros produtos ou campanhas — só nome da loja/campanha e a decisão.
 * As peças são montadas à parte (loadPreviewBundle), a partir da versão do link.
 */
export async function getPublicPreview(token: string, opts: { cookie?: PinCookies; countView?: boolean; now?: Date } = {}): Promise<PublicPreview> {
  const now = opts.now ?? new Date();
  const g = await gate(token, opts.cookie, now);
  if (g.state === "invalid" || g.state === "expired" || g.state === "revoked") return { state: g.state };
  if (g.state === "locked") return { state: "locked", until: g.until.toISOString() };
  if (g.state === "pin_required") return { state: "pin_required" };
  const l = g.link;
  const db = getDb();
  const [c] = await db.select({ version: schema.campaigns.version, deletedAt: schema.campaigns.deletedAt, name: schema.campaigns.name, storeId: schema.campaigns.storeId })
    .from(schema.campaigns).where(and(eq(schema.campaigns.id, l.campaignId), eq(schema.campaigns.orgId, l.orgId)));
  if (!c || c.deletedAt) return { state: "invalid" };
  const [store] = await db.select({ name: schema.stores.name }).from(schema.stores).where(and(eq(schema.stores.id, c.storeId), eq(schema.stores.orgId, l.orgId)));
  const storeName = store?.name ?? "";
  // o nome da campanha mostrado é o da versão do link (instantâneo), não o atual
  const [snap] = await db.select({ snapshot: schema.campaignVersions.snapshot }).from(schema.campaignVersions)
    .where(and(eq(schema.campaignVersions.orgId, l.orgId), eq(schema.campaignVersions.campaignId, l.campaignId), eq(schema.campaignVersions.version, l.campaignVersion)));
  const snapName = (snap?.snapshot as { campaign?: { name?: string } } | undefined)?.campaign?.name;
  const campaignName = snapName || c.name;
  if (opts.countView) await db.update(schema.previewLinks).set({ viewCount: sql`${schema.previewLinks.viewCount} + 1` }).where(eq(schema.previewLinks.id, l.id));
  const decision = l.decision ? { decision: l.decision, name: l.decidedName ?? "", comment: l.comment, at: (l.decidedAt ?? now).toISOString() } : null;
  if (c.version !== l.campaignVersion && !decision) return { state: "outdated", storeName, campaignName };
  return { state: "ok", storeName, campaignName, version: l.campaignVersion, expiresAt: l.expiresAt.toISOString(), decision };
}

/** Peças da versão do link, prontas para o PieceRenderer (somente quando o acesso foi liberado). */
export async function loadPreviewBundle(token: string, cookie: PinCookies, now = new Date()) {
  const g = await gate(token, cookie, now);
  if (g.state !== "ok") throw new AppError("not_found", "Link de prévia inválido.");
  const bundle = await loadRenderBundle({ orgId: g.link.orgId }, g.link.campaignId, { version: g.link.campaignVersion, signedUrlTtlSec: 6 * 3600 });
  const pieces = bundle.pieces.filter((p) => p.enabled).map((p) => ({ format: p.format, overrides: effectiveOverrides(bundle, p.format) }));
  return { campaign: bundle.campaign, templateId: bundle.templateId, templateVersion: bundle.templateVersion, pieces };
}

export const decisionSchema = z.object({
  name: z.string().trim().min(2, "Digite seu nome.").max(80),
  decision: z.enum(["aprovado", "alteracoes"]),
  comment: z.string().trim().max(1000).optional().transform((v) => v || null),
}).refine((d) => d.decision === "aprovado" || (d.comment && d.comment.length >= 3), { message: "Descreva as alterações que você precisa.", path: ["comment"] });

/** Registra a decisão do cliente (uma por link) e avisa a equipe (histórico + e-mail). */
export async function decidePreview(token: string, cookie: PinCookies, raw: unknown, now = new Date()) {
  const input = decisionSchema.parse(raw ?? {});
  const g = await gate(token, cookie, now);
  if (g.state === "invalid" || g.state === "expired" || g.state === "revoked") throw new AppError("not_found", "Este link de prévia não está mais disponível.");
  if (g.state === "locked") throw new AppError("rate_limited", "Link bloqueado por tentativas de PIN incorretas. Tente mais tarde.");
  if (g.state === "pin_required") throw new AppError("forbidden", "Digite o PIN para continuar.");
  const l = g.link;
  const db = getDb();
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, l.campaignId), eq(schema.campaigns.orgId, l.orgId), isNull(schema.campaigns.deletedAt))).for("update");
    if (!c) throw new AppError("not_found", "Este link de prévia não está mais disponível.");
    if (c.version !== l.campaignVersion) throw new AppError("conflict", "A campanha mudou depois que este link foi criado. Peça um link novo à equipe.");
    const [updated] = await tx.update(schema.previewLinks).set({ decision: input.decision, decidedAt: now, decidedName: input.name, comment: input.comment })
      .where(and(eq(schema.previewLinks.id, l.id), isNull(schema.previewLinks.decision), isNull(schema.previewLinks.revokedAt))).returning();
    if (!updated) throw new AppError("conflict", "Uma decisão já foi registrada neste link.");
    const what = input.decision === "aprovado" ? "aprovou" : "pediu alterações em";
    const summary = `${input.name} (cliente, por link) ${what} a prévia da campanha "${c.name}" (versão ${l.campaignVersion})${input.comment ? `: ${input.comment}` : "."}`;
    await writeAudit(tx, { orgId: l.orgId, userId: null, action: "campaign.external_decision", entityType: "campaign", entityId: c.id, summary: summary.slice(0, 1200),
      data: { linkId: l.id, version: l.campaignVersion, decision: input.decision, name: input.name, comment: input.comment } });
    // e-mail para quem criou o link e para administradores/aprovadores com acesso à loja da campanha
    const people = await tx.select({ userId: schema.users.id, email: schema.users.email, role: schema.memberships.role, storeIds: schema.memberships.storeIds })
      .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, l.orgId), isNull(schema.users.deletedAt), inArray(schema.memberships.role, ["admin", "aprovador", "editor"])));
    const to = people.filter((p) => (p.userId === l.createdBy || p.role !== "editor") && (p.storeIds === null || p.storeIds.includes(c.storeId)));
    const link = appUrl(`/app/campanhas/${c.id}`);
    const subject = input.decision === "aprovado" ? `Cliente aprovou: ${c.name}` : `Cliente pediu alterações: ${c.name}`;
    for (const p of to) {
      await sendEmail({ to: p.email, orgId: l.orgId, kind: "preview_decision", subject,
        text: `${summary}\n\nA aprovação por link é um registro da concordância do cliente. A publicação continua dependendo da aprovação interna no aplicativo.\n\nAbrir a campanha: ${link}` }, tx);
    }
    return { ok: true, decision: input.decision };
  });
}
