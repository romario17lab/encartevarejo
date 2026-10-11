import { platformAdminRoute } from "@/server/admin-http";
import { readJson } from "@/server/route-helpers";
import { updateTemplateSettings } from "@/server/services/admin/templates";

/** Categoria, ativo na galeria e ordem do modelo. */
export const PATCH = platformAdminRoute(async (req, admin, p) => updateTemplateSettings(admin.userId, p.id!, await readJson(req)));
