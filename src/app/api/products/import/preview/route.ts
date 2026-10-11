import { tenantRoute } from "@/server/http";
import { readUpload } from "@/server/route-helpers";
import { importPreview, MAX_IMPORT_BYTES } from "@/server/services/product-import";

export const POST = tenantRoute(async (req, ctx) => {
  const f = await readUpload(req, "file", MAX_IMPORT_BYTES);
  return importPreview(ctx, { data: f.data, name: f.name });
});
