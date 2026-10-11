import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { savePlaylist } from "@/server/services/tv";

/** Substitui a programação inteira (a ordem do array é a ordem de exibição). */
export const PUT = tenantRoute(async (req, ctx, p) => savePlaylist(ctx, p.id!, await readJson(req)), { permission: "campaigns.write" });
