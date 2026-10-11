import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/marketing/site";

// Área logada, administração, API, páginas de renderização, player de TV, aprovação e galeria interna ficam fora da busca.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/admin", "/api", "/render", "/render-video", "/tv", "/aprovar", "/modelos-amostra"],
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
