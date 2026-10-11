"use client";
import Link from "next/link";
import { AccountSwitcher, logout } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/common";
import { IconCalendar, IconChart, IconHistory, IconLogout, IconStore, IconTag, IconUpload, IconUser, IconUsers, IconCopy } from "@/components/app/icons";
import { useMe } from "@/lib/client/hooks";

export default function MorePage() {
  const { me, can } = useMe();
  const links = [
    { href: "/app/calendario", label: "Calendário de campanhas", icon: IconCalendar, show: true },
    { href: "/app/metricas", label: "Métricas", icon: IconChart, show: true },
    { href: "/app/filiais", label: "Filiais e preços por filial", icon: IconStore, show: true },
    { href: "/app/equipe", label: "Equipe e convites", icon: IconUsers, show: true },
    { href: "/app/historico", label: "Histórico de alterações", icon: IconHistory, show: can("audit.read") },
    { href: "/app/conta", label: "Conta e dados", icon: IconUser, show: true },
    { href: "/app/produtos/precos", label: "Atualizar preços", icon: IconTag, show: can("products.write") },
    { href: "/app/produtos/importar", label: "Importar planilha", icon: IconUpload, show: can("products.write") },
    { href: "/app/produtos/duplicados", label: "Produtos duplicados", icon: IconCopy, show: can("products.read") },
  ].filter((l) => l.show);
  return (
    <>
      <PageHeader title="Mais" description={<>Conectado como <strong>{me.user.name}</strong> ({me.user.email})</>} />
      <AccountSwitcher />
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="flex items-center gap-3 px-4 py-4 font-semibold hover:bg-surface-alt"><l.icon size={20} />{l.label}</Link></li>
        ))}
        <li><button onClick={logout} className="flex w-full items-center gap-3 px-4 py-4 text-left font-semibold text-danger hover:bg-surface-alt"><IconLogout size={20} />Sair</button></li>
      </ul>
    </>
  );
}
