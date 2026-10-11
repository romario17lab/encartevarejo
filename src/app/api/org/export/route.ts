import { NextResponse } from "next/server";
import { tenantRoute } from "@/server/http";
import { exportOrg } from "@/server/services/org";

export const GET = tenantRoute(async (_req, ctx) => {
  const data = await exportOrg(ctx);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dados-da-conta-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
