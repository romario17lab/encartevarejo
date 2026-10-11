import { tenantRoute } from "@/server/http";
import { revokePreviewLink } from "@/server/services/preview-links";

export const DELETE = tenantRoute(async (_req, ctx, p) => revokePreviewLink(ctx, p.id!));
