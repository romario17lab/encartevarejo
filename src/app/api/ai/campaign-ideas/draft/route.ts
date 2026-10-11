import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { createDraftFromIdea } from "@/server/services/ai-campaigns";

/** Cria campanha em rascunho com datas e produtos escolhidos (preços do catálogo). */
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createDraftFromIdea(ctx, await readJson(req)), { status: 201 }), { permission: "campaigns.write" });
