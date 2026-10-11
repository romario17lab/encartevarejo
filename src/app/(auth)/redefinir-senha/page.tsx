import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";
export const metadata: Metadata = { title: "Nova senha" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <ResetForm token={sp.token ?? ""} />;
}
