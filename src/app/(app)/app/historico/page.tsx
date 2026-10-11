import type { Metadata } from "next";
import { HistoryPage } from "./HistoryPage";

export const metadata: Metadata = { title: "Histórico" };

export default function Page() {
  return <HistoryPage />;
}
