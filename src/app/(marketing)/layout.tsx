import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/Chrome";

// Páginas públicas de conteúdo (SEO). Só servidor; nenhuma depende de login (o proxy só protege /app).
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
