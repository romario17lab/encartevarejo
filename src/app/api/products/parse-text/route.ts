import { z } from "zod";
import { tenantRoute } from "@/server/http";
import { readJson } from "@/server/route-helpers";
import { parseProductText } from "@/server/services/text-parser";

export const POST = tenantRoute(async (req) => {
  const { text } = z.object({ text: z.string().max(200_000, "Texto longo demais (máximo 200 mil caracteres).") }).parse(await readJson(req));
  return parseProductText(text);
}, { permission: "products.write" });
