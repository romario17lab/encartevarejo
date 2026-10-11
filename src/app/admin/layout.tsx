import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveSession } from "@/server/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Administração da plataforma", robots: { index: false, follow: false } };

// Área exclusiva de administradores da plataforma (users.is_platform_admin), verificada no servidor
// a cada carregamento. Para os demais (inclusive sem sessão) a área não existe: 404.
// As APIs /api/admin/** fazem a mesma verificação em toda requisição (src/server/admin-http.ts).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await resolveSession();
  if (!s?.user.isPlatformAdmin) notFound();
  return <AdminShell adminName={s.user.name}>{children}</AdminShell>;
}
