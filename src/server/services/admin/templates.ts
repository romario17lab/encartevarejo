// Administração dos modelos: publicação de versões (template_releases) e configuração (template_settings).
// Nada aqui altera campanhas: cada campanha mantém templateId + templateVersion fixados.
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getTemplate } from "@/templates/registry";
import { getDb, schema } from "../../db";
import { AppError, notFound } from "../../errors";
import {
  isVersionPublished, latestPublishedOf, loadTemplateControls, registryTemplateIds, registryVersions, templateSettingsOf,
} from "../templates";
import { writeAdminAudit } from "./audit";

export async function listTemplatesAdmin() {
  const db = getDb();
  const c = await loadTemplateControls(db);
  const usage = await db.select({ templateId: schema.campaigns.templateId, version: schema.campaigns.templateVersion, n: count() })
    .from(schema.campaigns).where(isNull(schema.campaigns.deletedAt))
    .groupBy(schema.campaigns.templateId, schema.campaigns.templateVersion);
  const used = new Map(usage.map((u) => [`${u.templateId}@${u.version}`, u.n]));
  const ids = registryTemplateIds();
  const templates = ids.map((id, idx) => {
    const versions = registryVersions(id);
    const s = templateSettingsOf(c, id);
    const latestPublished = latestPublishedOf(c, id);
    return {
      id, name: versions[0]!.name, description: versions[0]!.description, style: versions[0]!.style, segments: versions[0]!.segments,
      registryOrder: idx, category: s.category, isActive: s.isActive, sortOrder: s.sortOrder,
      latestVersion: versions[0]!.version, latestPublishedVersion: latestPublished?.version ?? null,
      offeredToNewCampaigns: s.isActive && !!latestPublished,
      campaignCount: versions.reduce((n, v) => n + (used.get(`${id}@${v.version}`) ?? 0), 0),
      versions: versions.map((v) => {
        const rel = c.releases.get(`${id}@${v.version}`);
        return {
          version: v.version, name: v.name, isPublished: isVersionPublished(c, id, v.version),
          releaseNotes: rel?.notes ?? null, releaseChangedAt: rel?.publishedAt ?? null,
          campaignCount: used.get(`${id}@${v.version}`) ?? 0,
          isLatestPublished: latestPublished?.version === v.version,
        };
      }),
    };
  });
  templates.sort((a, b) => a.sortOrder - b.sortOrder || a.registryOrder - b.registryOrder);
  const categories = [...new Set(templates.map((t) => t.category).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  // campanhas em versões mais antigas que a última publicada (candidatas a migração EXPLÍCITA pelo usuário)
  const outdated = templates.reduce((n, t) => n + t.versions.filter((v) => t.latestPublishedVersion != null && v.version < t.latestPublishedVersion).reduce((m, v) => m + v.campaignCount, 0), 0);
  return { templates, categories, outdatedCampaigns: outdated };
}

/** Campanhas (todas as contas) que usam uma versão de um modelo. Somente leitura: migração é decisão do cliente. */
export async function listTemplateCampaigns(templateId: string, version: number | null, limit = 100) {
  if (!getTemplate(templateId)) throw notFound("Modelo");
  const conds = [eq(schema.campaigns.templateId, templateId), isNull(schema.campaigns.deletedAt)];
  if (version != null) conds.push(eq(schema.campaigns.templateVersion, version));
  const rows = await getDb().select({
    id: schema.campaigns.id, name: schema.campaigns.name, status: schema.campaigns.status, templateVersion: schema.campaigns.templateVersion,
    updatedAt: schema.campaigns.updatedAt, orgId: schema.campaigns.orgId, orgName: schema.organizations.name,
  }).from(schema.campaigns)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.campaigns.orgId))
    .where(and(...conds)).orderBy(desc(schema.campaigns.updatedAt)).limit(Math.min(Math.max(limit, 1), 500));
  return { campaigns: rows };
}

const settingsSchema = z.object({
  category: z.string().trim().max(40).nullable().optional().transform((v) => (v ? v : v === undefined ? undefined : null)),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
}).strict();

export async function updateTemplateSettings(adminUserId: string, templateId: string, raw: unknown) {
  if (!getTemplate(templateId)) throw notFound("Modelo");
  const input = settingsSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(schema.templateSettings).where(eq(schema.templateSettings.templateId, templateId));
    const next = {
      category: input.category !== undefined ? input.category : cur?.category ?? null,
      isActive: input.isActive ?? cur?.isActive ?? true,
      sortOrder: input.sortOrder ?? cur?.sortOrder ?? 0,
    };
    await tx.insert(schema.templateSettings).values({ templateId, ...next, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.templateSettings.templateId, set: { ...next, updatedAt: new Date() } });
    await writeAdminAudit(tx, {
      adminUserId, action: "template.settings", targetType: "template", targetId: templateId,
      details: { before: cur ? { category: cur.category, isActive: cur.isActive, sortOrder: cur.sortOrder } : null, after: next },
    });
    return { templateId, ...next };
  });
}

const releaseSchema = z.object({
  isPublished: z.boolean(),
  notes: z.string().trim().max(500).optional(),
}).strict();

export async function setTemplateRelease(adminUserId: string, templateId: string, version: number, raw: unknown) {
  if (!getTemplate(templateId, version)) throw notFound("Versão do modelo");
  const input = releaseSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    if (!input.isPublished) {
      // não deixa o modelo ativo sem nenhuma versão publicada sem avisar: é permitido, mas só se for explícito no modelo inteiro
      const c = await loadTemplateControls(tx);
      const others = registryVersions(templateId).filter((v) => v.version !== version && isVersionPublished(c, templateId, v.version));
      if (!others.length && templateSettingsOf(c, templateId).isActive)
        throw new AppError("validation", "Esta é a única versão publicada do modelo. Para tirá-lo da galeria, desative o modelo em vez de despublicar a última versão.");
    }
    const [cur] = await tx.select().from(schema.templateReleases)
      .where(and(eq(schema.templateReleases.templateId, templateId), eq(schema.templateReleases.version, version)));
    const notes = input.notes !== undefined ? input.notes || null : cur?.notes ?? null;
    await tx.insert(schema.templateReleases).values({ templateId, version, isPublished: input.isPublished, publishedAt: new Date(), notes })
      .onConflictDoUpdate({ target: [schema.templateReleases.templateId, schema.templateReleases.version], set: { isPublished: input.isPublished, publishedAt: new Date(), notes } });
    const [{ n }] = await tx.select({ n: count() }).from(schema.campaigns)
      .where(and(eq(schema.campaigns.templateId, templateId), eq(schema.campaigns.templateVersion, version), isNull(schema.campaigns.deletedAt)));
    await writeAdminAudit(tx, {
      adminUserId, action: input.isPublished ? "template.publish" : "template.unpublish", targetType: "template_version", targetId: `${templateId}@${version}`,
      details: { templateId, version, wasPublished: cur?.isPublished ?? true, campaignsKeepingVersion: n, notes },
    });
    return { templateId, version, isPublished: input.isPublished, notes, campaignsKeepingVersion: n };
  });
}
