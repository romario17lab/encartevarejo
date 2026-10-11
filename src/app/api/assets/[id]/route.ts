import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { getTenantCtx } from "@/server/auth/session";
import { readAsset } from "@/server/services/assets";
import { verifyToken } from "@/server/signing";

export const GET = publicRoute(async (req: NextRequest, p) => {
  const token = req.nextUrl.searchParams.get("t");
  const ctx = token ? null : await getTenantCtx(req);
  const { asset, data } = await readAsset(p.id!, { token, ctx });
  const exp = token ? verifyToken(token)?.exp : null;
  const maxAge = exp ? Math.max(0, Math.min(86400, exp - Math.floor(Date.now() / 1000))) : 3600;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(data.length),
      "Cache-Control": `private, max-age=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...(asset.kind !== "image" ? { "Content-Disposition": "attachment" } : {}),
    },
  });
});
