import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { extractCommit } from "@/server/services/ai-extract";

/** Salva SOMENTE as linhas revisadas e confirmadas pelo usuário. */
export const POST = tenantRoute(async (req, ctx) => extractCommit(ctx, await readJson(req)), { permission: "products.write" });
