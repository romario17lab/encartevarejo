import type { Metadata } from "next";
import { StorePage } from "./StorePage";
export const metadata: Metadata = { title: "Loja e identidade" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <StorePage welcome={sp.boasvindas === "1"} />;
}
