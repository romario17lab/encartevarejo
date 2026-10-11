import { tenantRoute } from "@/server/http";
import { storage } from "@/server/storage";
import { getExportDownload } from "@/server/export/jobs";

export const dynamic = "force-dynamic";

const asciiName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");

/** GET /api/exports/:id/download — somente sessão da mesma conta. */
export const GET = tenantRoute(async (_req, ctx, params) => {
  const { asset, fileName } = await getExportDownload(ctx, params.id);
  const data = await storage.get(asset.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(data.length),
      "Content-Disposition": `attachment; filename="${asciiName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, { permission: "campaigns.read" });
