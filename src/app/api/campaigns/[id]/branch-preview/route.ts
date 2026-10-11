import { tenantRoute } from "@/server/http";
import { qp } from "@/server/route-helpers";
import { branchPreview } from "@/server/services/campaigns";

export const GET = tenantRoute(async (req, ctx, p) => branchPreview(ctx, p.id!, (qp(req, "storeIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean)));
