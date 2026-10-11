import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@/render/fonts.css";

export const metadata: Metadata = { title: "Prévia do vídeo", robots: { index: false, follow: false } };

/** Layout mínimo da cena de vídeo (prévia no editor): sem menus, fundo escuro, sem rolagem. */
export default function RenderVideoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`html,body{margin:0!important;padding:0!important;background:#111!important;overflow:hidden!important;min-height:0!important}
        body>a[href="#conteudo"],body>[aria-live],nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}`}</style>
      {children}
    </>
  );
}
