import { platformAdminRoute } from "@/server/admin-http";
import { qp } from "@/server/route-helpers";
import { listTemplateCampaigns } from "@/server/services/admin/templates";

/** Campanhas (todas as contas) que usam o modelo; ?version= filtra por versão. Somente leitura. */
export const GET = platformAdminRoute(async (req, _admin, p) => {
  const v = qp(req, "version");
  const version = v && /^\d{1,4}$/.test(v) ? Number(v) : null;
  return listTemplateCampaigns(p.id!, version);
});
