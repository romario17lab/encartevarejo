import { tenantRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { readJson } from "@/server/route-helpers";
import { restoreVersion } from "@/server/services/campaigns";

export const POST = tenantRoute(async (req, ctx, p) => {
  const v = Number(p.v);
  if (!Number.isInteger(v) || v < 1) throw new AppError("validation", "Versão inválida.");
  return restoreVersion(ctx, p.id!, v, await readJson(req));
});
