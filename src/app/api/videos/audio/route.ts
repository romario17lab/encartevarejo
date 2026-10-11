import { tenantRoute } from "@/server/http";
import { readUpload } from "@/server/route-helpers";
import { AUDIO_MAX_BYTES, uploadVideoAudio } from "@/server/services/videos";

export const dynamic = "force-dynamic";

/** POST /api/videos/audio (multipart: file, licenseConfirmed=true) → áudio próprio para vídeos */
export const POST = tenantRoute(async (req, ctx) => {
  const up = await readUpload(req, "file", AUDIO_MAX_BYTES);
  const r = await uploadVideoAudio(ctx, { data: up.data, name: up.name, type: up.type, licenseConfirmed: up.field("licenseConfirmed") === "true" });
  return Response.json(r, { status: 201 });
}, { permission: "exports.create" });
