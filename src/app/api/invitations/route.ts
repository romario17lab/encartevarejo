import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createInvitation, listInvitations } from "@/server/services/members";

export const GET = tenantRoute(async (_req, ctx) => ({ invitations: await listInvitations(ctx) }));
export const POST = tenantRoute(async (req, ctx) => createInvitation(ctx, await readJson(req)));
