import { NextResponse, type NextRequest } from "next/server";

// Proxy (antigo middleware): apenas um redirecionamento barato para quem abre /app sem cookie de sessão.
// A autenticação de verdade (validação da sessão no banco, conta e permissões) acontece nos Route Handlers.
export function proxy(request: NextRequest) {
  if (!request.cookies.get("ev_session")?.value) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("voltar", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/app/:path*"] };
