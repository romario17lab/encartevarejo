import { tenantRoute } from "@/server/http";
import { storage } from "@/server/storage";
import { getVideoDownload } from "@/server/services/videos";

export const dynamic = "force-dynamic";

const asciiName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");

/** GET /api/videos/:id/download[?inline=1] — somente sessão da mesma conta; aceita Range (player de vídeo). */
export const GET = tenantRoute(async (req, ctx, params) => {
  const { asset, fileName } = await getVideoDownload(ctx, params.id);
  const data = await storage.get(asset.storageKey);
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : data.length - 1;
    end = Math.min(end, data.length - 1);
    if (start > end || start >= data.length) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${data.length}` } });
    start = Math.max(0, start);
    const chunk = data.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), { status: 206, headers: { ...headers, "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${data.length}` } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
}, { permission: "campaigns.read" });
