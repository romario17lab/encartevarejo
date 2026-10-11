import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
export const metadata: Metadata = { title: "Entrar" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.voltar ?? null} reset={sp.senha === "redefinida"} />;
}
