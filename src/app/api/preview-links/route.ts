import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantRoute } from "@/server/http";
import { qp, readJson } from "@/server/route-helpers";
import { AppError } from "@/server/errors";
import { createPreviewLink, listPreviewLinks } from "@/server/services/preview-links";

export const GET = tenantRoute(async (req, ctx) => {
  const id = qp(req, "campaignId");
  if (!id) throw new AppError("validation", "Informe a campanha (campaignId).");
  return listPreviewLinks(ctx, id);
});

export const POST = tenantRoute(async (req, ctx) => {
  const body = (await readJson(req)) as Record<string, unknown>;
  const { campaignId } = z.object({ campaignId: z.string().min(1) }).parse(body);
  return NextResponse.json(await createPreviewLink(ctx, campaignId, body), { status: 201 });
});
