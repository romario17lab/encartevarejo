import { NextResponse } from "next/server";
import { publicRoute } from "@/server/http";
import { bearer, devicePlaylist } from "@/server/services/tv";

/** Programação do aparelho (token do aparelho). Também é o heartbeat (lastSeenAt). Suporta If-None-Match. */
export const GET = publicRoute(async (req) => {
  const r = await devicePlaylist(bearer(req.headers.get("authorization")), req.headers.get("if-none-match"));
  const headers = { ETag: r.etag, "Cache-Control": "no-store", Vary: "Authorization" };
  if (r.notModified) return new NextResponse(null, { status: 304, headers });
  return NextResponse.json(r.body, { headers });
});
