import type { Metadata } from "next";
import { BranchesPage } from "@/components/branches/BranchesPage";

export const metadata: Metadata = { title: "Filiais" };

export default function Page() {
  return <BranchesPage />;
}
