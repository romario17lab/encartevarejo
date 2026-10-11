import type { Metadata } from "next";
import { TvManager } from "@/components/tv/TvManager";

export const metadata: Metadata = { title: "TV da loja" };

export default function Page() {
  return <TvManager />;
}
