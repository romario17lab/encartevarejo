import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@/render/fonts.css";

export const metadata: Metadata = { title: "Renderização", robots: { index: false, follow: false } };

/** Layout mínimo da renderização: sem menus, margens zeradas, tamanho nativo do formato. */
export default function RenderLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`html,body{margin:0!important;padding:0!important;background:#fff!important;min-height:0!important}
        body>a[href="#conteudo"],body>[aria-live],nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}
        @page{margin:0}
        [data-ev-render] *{-webkit-print-color-adjust:exact;print-color-adjust:exact}`}</style>
      {children}
    </>
  );
}
