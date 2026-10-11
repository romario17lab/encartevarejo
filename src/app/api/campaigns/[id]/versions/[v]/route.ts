import { tenantRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { requirePermission } from "@/server/tenant";
import { getVersionSnapshot } from "@/server/services/campaigns";

export const GET = tenantRoute(async (_req, ctx, p) => {
  requirePermission(ctx, "campaigns.read");
  const v = Number(p.v);
  if (!Number.isInteger(v) || v < 1) throw new AppError("validation", "Versão inválida.");
  return { version: v, snapshot: await getVersionSnapshot(ctx, p.id!, v) };
});
