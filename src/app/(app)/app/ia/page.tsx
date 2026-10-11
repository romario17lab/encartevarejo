import type { Metadata } from "next";
import { AiHome } from "@/components/ai/AiHome";

export const metadata: Metadata = { title: "IA assistida" };

export default function Page() {
  return <AiHome />;
}
