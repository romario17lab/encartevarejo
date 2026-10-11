import { publicRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { clientIp, hitRateLimit } from "@/server/auth/rate-limit";
import { decidePreview } from "@/server/services/preview-links";

export const POST = publicRoute(async (req, p) => {
  hitRateLimit(`pv-decision:${clientIp(req)}`, 20, 15 * 60 * 1000);
  // cookies de PIN de prévia (um por link aberto neste navegador); o serviço confere qual vale para este link
  const pinCookies = req.cookies.getAll().filter((c) => c.name.startsWith("ev_pv_")).map((c) => c.value);
  return decidePreview(p.token ?? "", pinCookies, await readJson(req));
});
