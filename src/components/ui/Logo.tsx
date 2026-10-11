// Marca da plataforma: etiqueta de preço com uma "folha de encarte" de três linhas.
// Desenho próprio em SVG; o nome exibido vem de NEXT_PUBLIC_BRAND_NAME (brand.ts).
import type { SVGProps } from "react";
import { BRAND_NAME } from "./brand";

/** Símbolo (sem texto). `title` vira o nome acessível; omita em usos decorativos ao lado do nome. */
export function LogoMark({ size = 32, title, ...rest }: { size?: number; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title && <title>{title}</title>}
      {/* etiqueta: retângulo arredondado com o canto superior esquerdo chanfrado */}
      <path d="M17 4h23a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V17Z" fill="#0B6B4F" />
      <circle cx="13.5" cy="13.5" r="3.2" fill="#F6F7F2" />
      {/* linhas do encarte (lista de produtos) */}
      <rect x="13" y="22" width="24" height="4.6" rx="2.3" fill="#FFD23F" />
      <rect x="13" y="29.5" width="18" height="4.6" rx="2.3" fill="#F6F7F2" />
      <rect x="13" y="37" width="11" height="3.4" rx="1.7" fill="#F6F7F2" opacity="0.7" />
      {/* selo de oferta */}
      <circle cx="37" cy="12" r="6.5" fill="#C2410C" />
      <path d="M34.2 14.8l5.6-5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="34.6" cy="10" r="1.1" fill="#fff" />
      <circle cx="39.4" cy="14" r="1.1" fill="#fff" />
    </svg>
  );
}

/** Símbolo + nome da marca. */
export function Logo({ size = 32, className, showName = true }: { size?: number; className?: string; showName?: boolean }) {
  return (
    <span className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
      <LogoMark size={size} title={showName ? undefined : BRAND_NAME} />
      {showName && <span className="font-display text-lg font-extrabold tracking-tight text-ink">{BRAND_NAME}</span>}
    </span>
  );
}
