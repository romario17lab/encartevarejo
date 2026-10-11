import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "@/render/fonts.css";

export const metadata: Metadata = { title: "TV da loja", robots: { index: false, follow: false }, manifest: null };
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

/** Layout do player da TV: tela cheia, fundo preto, sem barras de rolagem nem elementos da plataforma. */
export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`html,body{margin:0!important;padding:0!important;background:#000!important;color:#fff;overflow:hidden!important;height:100%;min-height:0!important;overscroll-behavior:none}
        ::-webkit-scrollbar{display:none}html{scrollbar-width:none}
        body>a[href="#conteudo"],body>[aria-live],nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}`}</style>
      {children}
    </>
  );
}
