import type { Metadata } from "next";
import { BranchPricesPage } from "@/components/branches/BranchPricesPage";

export const metadata: Metadata = { title: "Preços da filial" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BranchPricesPage storeId={id} />;
}
