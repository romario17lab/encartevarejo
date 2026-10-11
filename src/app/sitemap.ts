import type { MetadataRoute } from "next";
import { CONTENT_PAGES, siteUrl } from "@/components/marketing/site";

// Sitemap das páginas públicas de apresentação (spec, seção 17). Base: APP_URL.
// Vitrines das lojas (/loja/<slug>) podem ser rastreadas, mas não são listadas aqui.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl("/"), changeFrequency: "monthly", priority: 1 },
    ...CONTENT_PAGES.map((p) => ({ url: siteUrl(p.href), changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
