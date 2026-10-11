import { NextResponse, type NextRequest } from "next/server";
import { publicRoute } from "@/server/http";
import { devEmailsEnabled, listDevEmails } from "@/server/email";

// Somente fora de produção: permite usar links de recuperação/convite sem SMTP.
export const GET = publicRoute(async (req: NextRequest) => {
  if (!devEmailsEnabled()) return NextResponse.json({ error: { code: "not_found", message: "Não encontrado." } }, { status: 404 });
  return { emails: await listDevEmails({ to: req.nextUrl.searchParams.get("to"), limit: Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50 }) };
});
