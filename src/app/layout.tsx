import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui";
import "./globals.css";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";

export const metadata: Metadata = {
  title: { default: `${BRAND} — encartes e ofertas para o seu mercado`, template: `%s · ${BRAND}` },
  description: "Transforme sua lista de produtos em encarte, posts, story, cartazes e etiquetas com os preços certos.",
  applicationName: BRAND,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#166534",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-sans">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow">
          Pular para o conteúdo
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
