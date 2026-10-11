import type { Metadata } from "next";
import { EditorLoader } from "@/components/editor/Editor";

export const metadata: Metadata = { title: "Editor da campanha" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <EditorLoader id={id} initialTab={sp.aba} />;
}
