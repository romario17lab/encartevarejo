import { tenantRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { canAccessStore } from "@/server/tenant";
import { loadRenderBundle, type VersionSelector } from "@/server/services/render-data";

export const dynamic = "force-dynamic";

/** GET /api/campaigns/:id/render-data?version=current|published|<n> → RenderCampaign (URLs assinadas, sem custo) */
export const GET = tenantRoute(async (req, ctx, params) => {
  const raw = req.nextUrl.searchParams.get("version") ?? "current";
  let version: VersionSelector;
  if (raw === "current" || raw === "published") version = raw;
  else if (/^\d+$/.test(raw)) version = Number(raw);
  else throw new AppError("validation", "Versão inválida.");
  const bundle = await loadRenderBundle({ orgId: ctx.orgId }, params.id, { version, signedUrlTtlSec: 3600 });
  if (!canAccessStore(ctx, bundle.storeId)) throw new AppError("forbidden", "Você não tem acesso a esta loja.");
  return bundle.campaign;
}, { permission: "campaigns.read" });
