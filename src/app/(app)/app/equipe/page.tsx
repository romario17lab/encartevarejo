import type { Metadata } from "next";
import { TeamPage } from "@/components/team/TeamPage";

export const metadata: Metadata = { title: "Equipe" };

export default function Page() {
  return <TeamPage />;
}
