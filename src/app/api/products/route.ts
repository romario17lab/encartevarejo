import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { qp, readJson } from "@/server/route-helpers";
import { createProduct, listProducts } from "@/server/services/products";

export const GET = tenantRoute(async (req, ctx) => listProducts(ctx, {
  q: qp(req, "q"), category: qp(req, "category"), issues: qp(req, "issues"), cursor: qp(req, "cursor"),
  limit: Number(qp(req, "limit") ?? 50) || 50, archived: qp(req, "archived") === "1",
}));
export const POST = tenantRoute(async (req, ctx) => NextResponse.json(await createProduct(ctx, await readJson(req)), { status: 201 }));
