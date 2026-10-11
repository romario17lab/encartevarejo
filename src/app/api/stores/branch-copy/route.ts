import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { qp, readJson } from "@/server/route-helpers";
import { branchCopyPreview, duplicateToBranches } from "@/server/services/stores";

/** GET ?campaignId=&storeIds=a,b → prévia das diferenças por filial */
export const GET = tenantRoute(async (req, ctx) => branchCopyPreview(ctx, qp(req, "campaignId") ?? "",
  (qp(req, "storeIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean)));

/** POST { campaignId, storeIds } → cria uma cópia em rascunho para cada filial */
export const POST = tenantRoute(async (req, ctx) => {
  const body = (await readJson(req)) as { campaignId?: unknown } | null;
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
  return NextResponse.json(await duplicateToBranches(ctx, campaignId, body), { status: 201 });
});
