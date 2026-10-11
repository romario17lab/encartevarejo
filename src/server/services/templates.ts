import { eq } from "drizzle-orm";
import { listTemplates } from "@/templates/registry";
import { getDb, schema } from "../db";

/** Modelos disponíveis (última versão de cada um), sem os despublicados pela administração. */
export async function listPublishedTemplates() {
  const unpublished = await getDb().select({ templateId: schema.templateReleases.templateId, version: schema.templateReleases.version })
    .from(schema.templateReleases).where(eq(schema.templateReleases.isPublished, false));
  const hidden = new Set(unpublished.map((u) => `${u.templateId}@${u.version}`));
  return listTemplates().filter((t) => !hidden.has(`${t.id}@${t.version}`)).map((t) => ({
    id: t.id, version: t.version, name: t.name, description: t.description, segments: t.segments, style: t.style,
    palette: t.palette, useBrandColors: t.useBrandColors, fonts: t.fonts, supportedFormats: t.supportedFormats, thumbnailFormat: t.thumbnailFormat ?? null,
  }));
}
