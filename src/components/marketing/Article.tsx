// Estrutura das páginas de conteúdo: trilha, H1 único, introdução, texto, chamada e páginas relacionadas.
import Link from "next/link";
import type { ReactNode } from "react";
import { CtaBand, RelatedPages } from "./Chrome";
import { BRAND, relatedPages, siteUrl } from "./site";

/** Tipografia do texto corrido (sem plugin): títulos, parágrafos, listas, tabelas e links. */
export const prose = [
  "text-base leading-relaxed text-ink sm:text-[17px]",
  "[&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:leading-tight [&_h2]:scroll-mt-4",
  "[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold",
  "[&_p]:mt-4 [&_ul]:mt-4 [&_ol]:mt-4 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:mt-2",
  "[&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-brand-strong",
  "[&_strong]:font-semibold",
].join(" ");

export function Article({ path, label, title, lead, related, children, cta }: {
  path: string;
  label: string;
  title: string;
  lead: ReactNode;
  related: string[];
  children: ReactNode;
  cta?: { title?: string; text?: string };
}) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: BRAND, item: siteUrl("/") },
      { "@type": "ListItem", position: 2, name: label, item: siteUrl(path) },
    ],
  };
  return (
    <article className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }} />
      <nav aria-label="Trilha" className="text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li><Link href="/" className="rounded underline-offset-4 hover:text-brand hover:underline">Início</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-semibold text-ink">{label}</li>
        </ol>
      </nav>
      <header className="mt-4 max-w-3xl">
        <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">{title}</h1>
        <div className="mt-4 text-lg text-ink-muted">{lead}</div>
      </header>
      <div className="mt-8">{children}</div>
      <div className="mt-14"><CtaBand {...cta} /></div>
      <RelatedPages pages={relatedPages(path, related)} />
    </article>
  );
}

/** Bloco de texto com largura de leitura confortável. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[prose, "max-w-3xl [&>*:first-child]:mt-0", className].filter(Boolean).join(" ")}>{children}</div>;
}

/** Caixa "Como o produto faz isso". */
export function HowWeDoIt({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <aside aria-label={title ?? `Como o ${BRAND} faz isso`} className={`mt-10 max-w-3xl rounded-2xl border border-brand/30 bg-brand-soft p-5 sm:p-6 ${prose} [&>*:first-child]:mt-0`}>
      <h2 className="!mt-0 !text-xl">{title ?? `Como o ${BRAND} faz isso`}</h2>
      {children}
    </aside>
  );
}
