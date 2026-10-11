import { AccountDetail } from "@/components/admin/Accounts";

export const metadata = { title: "Conta · Administração" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AccountDetail id={id} />;
}
