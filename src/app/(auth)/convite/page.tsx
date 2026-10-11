import type { Metadata } from "next";
import { AcceptInvite } from "./AcceptInvite";
export const metadata: Metadata = { title: "Aceitar convite" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <AcceptInvite token={sp.token ?? ""} />;
}
