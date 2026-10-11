import type { Metadata } from "next";
import { ProductsList } from "./ProductsList";
export const metadata: Metadata = { title: "Produtos" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <ProductsList initial={{ q: sp.q ?? "", category: sp.categoria ?? "", issues: sp.issues ?? "", novo: sp.novo === "1" }} />;
}
