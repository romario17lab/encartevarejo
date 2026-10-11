import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { deleteCampaign, getEditorState, saveCampaign } from "@/server/services/campaigns";

export const GET = tenantRoute(async (_req, ctx, p) => getEditorState(ctx, p.id!));
export const PUT = tenantRoute(async (req, ctx, p) => saveCampaign(ctx, p.id!, await readJson(req)));
export const DELETE = tenantRoute(async (_req, ctx, p) => deleteCampaign(ctx, p.id!));
