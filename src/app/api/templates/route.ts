import { tenantRoute } from "@/server/http";
import { listPublishedTemplates } from "@/server/services/templates";

export const GET = tenantRoute(async () => ({ templates: await listPublishedTemplates() }));
