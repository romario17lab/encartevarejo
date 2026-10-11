import { tenantRoute } from "@/server/http";
import { readUpload } from "@/server/route-helpers";
import { MAX_IMPORT_BYTES } from "@/server/services/product-import";
import { runImportProfile } from "@/server/services/import-profiles";

/** Importação em um passo com um perfil salvo (multipart: file). */
export const POST = tenantRoute(async (req, ctx, p) => {
  const f = await readUpload(req, "file", MAX_IMPORT_BYTES);
  return runImportProfile(ctx, p.id!, { data: f.data, name: f.name });
});
