import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { readTvMedia } from "@/server/services/tv";

/** Vídeo (ou imagem) da programação, com URL assinada pela tela. Suporta Range (bytes=a-b). */
export const GET = publicRoute(async (req: NextRequest, p) => {
  const { asset, data, exp } = await readTvMedia(p.assetId!, req.nextUrl.searchParams.get("t"));
  const maxAge = Math.max(0, Math.min(86400, exp - Math.floor(Date.now() / 1000)));
  const base = { "Content-Type": asset.mime, "Accept-Ranges": "bytes", "Cache-Control": `private, max-age=${maxAge}`, "X-Content-Type-Options": "nosniff" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = data.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    const chunk = data.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), { status: 206, headers: { ...base, "Content-Length": String(chunk.length), "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  return new NextResponse(new Uint8Array(data), { headers: { ...base, "Content-Length": String(data.length) } });
});
