import type { MetadataRoute } from "next";

// Manifesto PWA (instalável). Sem service worker offline nesta etapa.
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";
  return {
    name,
    short_name: name,
    description: "Encartes, posts, cartazes e etiquetas de ofertas para o seu mercado.",
    lang: "pt-BR",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f8faf7",
    theme_color: "#0B6B4F",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
