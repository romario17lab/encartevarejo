// Cabeçalho, rodapé, chamada para cadastro e "leia também" das páginas públicas. Componentes de servidor, sem JS no cliente.
import Link from "next/link";
import type React from "react";
import { Logo } from "@/components/ui/Logo";
import { BRAND, CONTENT_PAGES, type ContentPage } from "./site";

const btnBase = "inline-flex min-h-tap items-center justify-center rounded-xl px-5 py-3 text-base font-semibold transition-colors";
export const btnPrimary = `${btnBase} bg-brand text-white hover:bg-brand-strong`;
export const btnSecondary = `${btnBase} border border-line-strong/70 bg-surface text-ink hover:bg-brand-soft`;

export function MarketingHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="rounded-lg" aria-label={`${BRAND} — página inicial`}>
          <Logo size={30} />
        </Link>
        <nav aria-label="Conta" className="flex items-center gap-1 sm:gap-2">
          <Link href="/entrar" className="inline-flex min-h-tap items-center rounded-lg px-3 text-sm font-semibold text-brand hover:bg-brand-soft">Entrar</Link>
          <Link href="/cadastro" className="inline-flex min-h-tap items-center rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong">Criar conta</Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1fr_2fr] sm:px-6">
        <div>
          <Logo size={28} />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">Encartes, posts, cartazes, etiquetas, vídeos e vitrine digital a partir da mesma lista de produtos.</p>
        </div>
        <nav aria-label="Guias" className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <p className="font-display font-bold text-ink sm:col-span-2">Guias</p>
          {CONTENT_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="inline-flex min-h-tap items-center rounded text-ink-muted underline-offset-4 hover:text-brand hover:underline sm:min-h-0 sm:py-1">{p.label}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-muted sm:px-6">
          {BRAND} · Os exemplos de peças nesta página usam dados de demonstração: loja, produtos e preços fictícios.
        </p>
      </div>
    </footer>
  );
}

export function CtaBand({ title = "Monte a próxima campanha", text }: { title?: string; text?: string }) {
  return (
    <section aria-labelledby="cta-titulo" className="rounded-2xl bg-brand px-5 py-8 text-white sm:px-10">
      <h2 id="cta-titulo" className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-base text-white/90">
        {text ?? "Crie a conta, cadastre a loja e transforme a lista de produtos da semana nas peças de que você precisa."}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link href="/cadastro" className={`${btnBase} bg-highlight text-ink hover:bg-white`}>Criar conta</Link>
        <Link href="/entrar" className={`${btnBase} border border-white/70 text-white hover:bg-white/10`}>Já tenho conta</Link>
      </div>
    </section>
  );
}

export function RelatedPages({ pages, title = "Leia também" }: { pages: ContentPage[]; title?: string }) {
  if (!pages.length) return null;
  return (
    <section aria-labelledby="relacionadas" className="mt-12">
      <h2 id="relacionadas" className="font-display text-xl font-extrabold">{title}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 hover:border-brand hover:bg-brand-soft/40">
              <span className="font-display font-bold text-brand">{p.label}</span>
              <span className="mt-1 text-sm text-ink-muted">{p.teaser}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Moldura das páginas públicas: cabeçalho, conteúdo principal (alvo do "Pular para o conteúdo") e rodapé. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
