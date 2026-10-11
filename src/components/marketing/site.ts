// Páginas públicas de marketing/SEO: endereço base, lista de páginas de conteúdo e metadados comuns.
// A marca vem sempre de NEXT_PUBLIC_BRAND_NAME (BRAND_NAME); nunca escreva o nome fixo nos textos.
import type { Metadata } from "next";
import { BRAND_NAME } from "@/components/ui/brand";
import { EXAMPLES, type ExampleId } from "./examples";

export const BRAND = BRAND_NAME;

/** URL absoluta a partir de APP_URL (a mesma base usada em links, QR codes e e-mails). */
export function siteUrl(path = "/"): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return path === "/" ? `${base}/` : `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface ContentPage {
  href: string;
  /** rótulo curto para menus e links */
  label: string;
  /** frase curta para cartões de "leia também" */
  teaser: string;
}

/** As seis páginas de conteúdo (ordem usada no rodapé, na home e no sitemap). */
export const CONTENT_PAGES: ContentPage[] = [
  { href: "/criar-encarte-online", label: "Criar encarte online", teaser: "O passo a passo do encarte da semana, da lista de preços ao PDF para a gráfica." },
  { href: "/gerador-de-encartes", label: "Gerador de encartes", teaser: "Uma lista de produtos gera encarte, posts, story, cartazes, etiquetas, TV e vídeo." },
  { href: "/encarte-para-supermercado", label: "Encarte para supermercado", teaser: "Como dividir por seções, escolher destaques e escrever validade e condições." },
  { href: "/cartaz-de-ofertas", label: "Cartaz de ofertas", teaser: "Cartaz A4 e A3 legível de longe, com de/por, unidade e preço por quilo." },
  { href: "/encarte-digital-whatsapp", label: "Encarte digital para WhatsApp", teaser: "Tamanhos para status e grupos, e o link da vitrine com lista para WhatsApp." },
  { href: "/marketing-para-lojas-de-varejo", label: "Marketing para lojas de varejo", teaser: "Uma rotina semanal simples: calendário, canais, aprovação e o que medir." },
];

export function relatedPages(current: string, hrefs: string[]): ContentPage[] {
  return hrefs.filter((h) => h !== current).map((h) => CONTENT_PAGES.find((p) => p.href === h)).filter((p): p is ContentPage => !!p);
}

/** Metadados de uma página pública: título, descrição, canonical, Open Graph e Twitter. */
export function marketingMetadata(opts: { path: string; title: string; description: string; image: ExampleId; absoluteTitle?: boolean }): Metadata {
  const url = siteUrl(opts.path);
  const img = EXAMPLES[opts.image];
  const ogTitle = opts.absoluteTitle ? opts.title : `${opts.title} · ${BRAND}`;
  const images = [{ url: siteUrl(img.src), width: img.width, height: img.height, alt: img.alt }];
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_BR", url, siteName: BRAND, title: ogTitle, description: opts.description, images },
    twitter: { card: "summary_large_image", title: ogTitle, description: opts.description, images: images.map((i) => i.url) },
  };
}
