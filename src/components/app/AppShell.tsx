"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cx, ErrorState, Spinner, toast } from "@/components/ui";
import { ROLE_LABEL } from "@/domain/campaign";
import { api, ApiError, type Me } from "@/lib/client/api";
import { hasPermission, MeContext, safeStorage, type MeCtx } from "@/lib/client/hooks";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { IconBox, IconCalendar, IconChart, IconHistory, IconHome, IconSparkle, IconBriefcase, IconPlug, IconTv, IconLogout, IconMegaphone, IconMenu, IconStore, IconUser, IconUsers } from "./icons";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";
const STORE_KEY = "ev.storeId";

const TABS = [
  { href: "/app", label: "Início", icon: IconHome, exact: true },
  { href: "/app/campanhas", label: "Campanhas", icon: IconMegaphone },
  { href: "/app/produtos", label: "Produtos", icon: IconBox },
  { href: "/app/loja", label: "Loja", icon: IconStore },
  { href: "/app/mais", label: "Mais", icon: IconMenu, also: ["/app/equipe", "/app/conta", "/app/calendario", "/app/metricas", "/app/filiais", "/app/historico", "/app/ia", "/app/agencia", "/app/integracoes", "/app/tv"] },
];
const SIDE_EXTRA = [
  { href: "/app/calendario", label: "Calendário", icon: IconCalendar },
  { href: "/app/metricas", label: "Métricas", icon: IconChart },
  { href: "/app/tv", label: "TV da loja", icon: IconTv },
  { href: "/app/ia", label: "IA assistida", icon: IconSparkle },
  { href: "/app/filiais", label: "Filiais", icon: IconStore },
  { href: "/app/equipe", label: "Equipe", icon: IconUsers },
  { href: "/app/historico", label: "Histórico", icon: IconHistory, perm: "audit.read" as const },
  { href: "/app/agencia", label: "Agência", icon: IconBriefcase, perm: "org.manage" as const },
  { href: "/app/integracoes", label: "Integrações", icon: IconPlug, perm: "org.manage" as const },
  { href: "/app/conta", label: "Conta", icon: IconUser },
];

function isActive(path: string, t: { href: string; exact?: boolean; also?: string[] }) {
  if (t.exact) return path === t.href;
  return path === t.href || path.startsWith(t.href + "/") || !!t.also?.some((a) => path.startsWith(a));
}

export async function logout() {
  try { await api.post("/api/auth/logout", {}, { noAuthRedirect: true }); } catch { /* sai mesmo assim */ }
  window.location.assign("/entrar");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/app";
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [storeId, setStoreIdState] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const m = await api.get<Me>("/api/me");
      setMe(m);
      const saved = safeStorage()?.getItem(STORE_KEY);
      const stores = m.stores ?? [];
      setStoreIdState(stores.find((s) => s.id === saved)?.id ?? stores[0]?.id ?? null);
    } catch (e) {
      setError(e as ApiError);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setStoreId = useCallback((id: string) => { setStoreIdState(id); safeStorage()?.setItem(STORE_KEY, id); }, []);
  const ctx = useMemo<MeCtx | null>(() => me && { me, reload: load, can: (p) => hasPermission(me, p), storeId, setStoreId }, [me, load, storeId, setStoreId]);

  // editor ocupa a tela inteira (sem barra inferior) para dar espaço à prévia
  const fullBleed = /^\/app\/campanhas\/(?!nova)[^/]+$/.test(path);

  if (error) {
    return <div className="mx-auto max-w-md p-6"><ErrorState title="Não foi possível abrir sua conta" message={error.message} onRetry={load} /></div>;
  }
  if (me && !me.org) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState title="Você não participa de nenhuma conta" message="Peça um novo convite ao administrador da sua loja ou crie uma conta nova." />
        <button onClick={logout} className="mt-4 font-semibold text-brand underline">Sair</button>
      </div>
    );
  }
  if (!ctx) {
    return <div className="flex min-h-dvh items-center justify-center"><Spinner size={32} label="Carregando sua conta" /></div>;
  }
  return (
    <MeContext.Provider value={ctx}>
      <div className="min-h-dvh lg:flex">
        <aside className={cx("sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface", !fullBleed && "lg:flex")} aria-label="Navegação principal">
          <div className="px-5 py-5 font-display text-xl font-extrabold text-brand">{BRAND}</div>
          <div className="px-3"><AccountSwitcher /></div>
          <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
            {[...TABS.filter((t) => t.href !== "/app/mais"), ...SIDE_EXTRA.filter((t) => !("perm" in t) || !t.perm || ctx.can(t.perm))].map((t) => {
              const active = isActive(path, t);
              return (
                <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
                  className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold", active ? "bg-brand-soft text-brand-strong" : "text-ink-muted hover:bg-ink/5 hover:text-ink")}>
                  <t.icon size={20} />{t.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-line p-3">
            <p className="truncate px-3 text-sm font-semibold">{me!.user.name}</p>
            <p className="truncate px-3 text-xs text-ink-muted">{me!.user.email}</p>
            <button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-ink/5"><IconLogout size={18} />Sair</button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {!fullBleed && (
            <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
              <span className="font-display text-lg font-extrabold text-brand">{BRAND}</span>
              <StoreSelector compact />
            </header>
          )}
          <main id="conteudo" className={cx(fullBleed ? "" : "mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-8")}>
            {!fullBleed && <div className="mb-3 hidden justify-end lg:flex"><StoreSelector /></div>}
            {!fullBleed && path !== "/app/conta/plano" && <SubscriptionBanner className="mb-4" />}
            {children}
          </main>
        </div>
        {!fullBleed && (
          <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
            <ul className="grid grid-cols-5">
              {TABS.map((t) => {
                const active = isActive(path, t);
                return (
                  <li key={t.href}>
                    <Link href={t.href} aria-current={active ? "page" : undefined}
                      className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-brand" : "text-ink-muted")}>
                      <t.icon size={22} />{t.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </MeContext.Provider>
  );
}

/** Troca de conta (quando o usuário participa de mais de uma). */
export function AccountSwitcher() {
  const ctx = useMeSafe();
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;
  const { me } = ctx;
  if ((me.orgs?.length ?? 0) <= 1) {
    return (
      <div className="rounded-xl bg-surface-alt px-3 py-2">
        <p className="truncate text-sm font-semibold">{me.org.name}</p>
        <p className="text-xs text-ink-muted">{ROLE_LABEL[me.role]}</p>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="sr-only">Conta ativa</span>
      <select disabled={busy} value={me.org.id} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-semibold"
        onChange={async (e) => {
          setBusy(true);
          try { await api.post("/api/me/active-org", { orgId: e.target.value }); window.location.assign("/app"); }
          catch (err) { toast((err as Error).message, "error"); setBusy(false); }
        }}>
        {me.orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({ROLE_LABEL[o.role]})</option>)}
      </select>
    </label>
  );
}

/** Seletor de loja: só aparece quando a conta tem mais de uma loja. */
export function StoreSelector({ compact }: { compact?: boolean }) {
  const ctx = useMeSafe();
  if (!ctx || (ctx.me.stores?.length ?? 0) <= 1) return null;
  return (
    <label className={cx("flex items-center gap-2", compact && "max-w-[55%]")}>
      <span className={cx("text-sm text-ink-muted", compact && "sr-only")}>Loja</span>
      <select value={ctx.storeId ?? ""} onChange={(e) => ctx.setStoreId(e.target.value)}
        className="h-10 min-w-0 rounded-xl border border-line bg-surface px-2 text-sm font-semibold">
        {ctx.me.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}

function useMeSafe() { return useContext(MeContext); }
