import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@/render/fonts.css";

// Página pública de aprovação por link: nunca indexada; o token da URL não vaza em Referer.
export const metadata: Metadata = {
  title: "Prévia para aprovação",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function ApprovalLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-surface-alt">{children}</div>;
}
