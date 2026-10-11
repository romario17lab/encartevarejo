import Link from "next/link";
import type { ReactNode } from "react";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-6">
      <Link href="/" className="mb-6 font-display text-xl font-extrabold text-brand">{BRAND}</Link>
      <main id="conteudo" className="w-full max-w-md">{children}</main>
    </div>
  );
}
