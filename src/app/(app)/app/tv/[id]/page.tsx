import type { Metadata } from "next";
import { TvScreenEditor } from "@/components/tv/TvScreenEditor";

export const metadata: Metadata = { title: "Tela de TV" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TvScreenEditor id={id} />;
}
