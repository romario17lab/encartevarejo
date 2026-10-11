import { platformAdminRoute } from "@/server/admin-http";
import { AppError } from "@/server/errors";
import { readJson } from "@/server/route-helpers";
import { setTemplateRelease } from "@/server/services/admin/templates";

/** Publica ou despublica uma versão: { isPublished, notes? }. Campanhas existentes mantêm a versão fixada. */
export const PUT = platformAdminRoute(async (req, admin, p) => {
  if (!/^\d{1,4}$/.test(p.version ?? "")) throw new AppError("validation", "Versão inválida.");
  return setTemplateRelease(admin.userId, p.id!, Number(p.version), await readJson(req));
});
