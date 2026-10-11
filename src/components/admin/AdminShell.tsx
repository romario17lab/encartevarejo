"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/contas", label: "Contas" },
  { href: "/admin/modelos", label: "Modelos" },
  { href: "/admin/planos", label: "Planos" },
  { href: "/admin/exportacoes", label: "Exportações" },
  { href: "/admin/consumo", label: "Consumo" },
  { href: "/admin/cobranca", label: "Cobrança" },
  { href: "/admin/registro", label: "Registro de ações" },
];

export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  const path = usePathname() ?? "/admin";
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <div className="min-h-dvh bg-surface-alt">
      <header className="border-b border-line bg-ink text-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">EncarteVarejo</p>
            <p className="font-display text-[15px] font-extrabold leading-tight sm:text-lg">Administração da plataforma</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden text-white/80 sm:inline" title="Administrador da plataforma">{adminName}</span>
            <Link href="/app" className="inline-flex min-h-[40px] items-center rounded-lg border border-white/30 px-3 font-semibold hover:bg-white/10"><span className="sm:hidden">App</span><span className="hidden sm:inline">Ir para o app</span></Link>
          </div>
        </div>
        <nav aria-label="Seções da administração" className="mx-auto max-w-[1400px] lg:hidden">
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2">
            {NAV.map((n) => (
              <li key={n.href} className="shrink-0">
                <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
                  className={cx("inline-flex min-h-[40px] items-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold", active(n.href) ? "bg-white text-ink" : "text-white/85 hover:bg-white/10")}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-5 lg:py-6">
        <nav aria-label="Seções da administração" className="hidden w-52 shrink-0 lg:block">
          <ul className="sticky top-4 flex flex-col gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={active(n.href) ? "page" : undefined}
                  className={cx("flex min-h-[40px] items-center rounded-xl px-3 text-sm font-semibold", active(n.href) ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-muted hover:bg-surface hover:text-ink")}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="conteudo" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
