// Remoção de um arquivo gerado (storage + linha em assets), sempre dentro da conta.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { storage } from "@/server/storage";

export async function discardAsset(orgId: string, assetId: string) {
  const db = getDb();
  const [a] = await db.select().from(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, orgId)));
  if (!a) return;
  await storage.delete(a.storageKey).catch(() => undefined);
  await db.delete(schema.assets).where(and(eq(schema.assets.id, assetId), eq(schema.assets.orgId, orgId)));
}
