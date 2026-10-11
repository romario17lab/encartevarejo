import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { importCommit } from "@/server/services/product-import";

export const POST = tenantRoute(async (req, ctx) => importCommit(ctx, await readJson(req)));
