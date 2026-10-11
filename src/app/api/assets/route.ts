import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readUpload } from "@/server/route-helpers";
import { MAX_UPLOAD_BYTES, uploadImage } from "@/server/services/assets";

export const POST = tenantRoute(async (req, ctx) => {
  const f = await readUpload(req, "file", MAX_UPLOAD_BYTES);
  const r = await uploadImage(ctx, { data: f.data, originalName: f.name, source: f.field("source"), sourceNote: f.field("sourceNote") });
  return NextResponse.json(r, { status: r.deduplicated ? 200 : 201 });
});
