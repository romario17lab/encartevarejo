"use client";
import { useState } from "react";
import { Button, Card, Dialog, Input, toast } from "@/components/ui";
import { PageHeader } from "@/components/app/common";
import { api } from "@/lib/client/api";
import { useMe } from "@/lib/client/hooks";

export default function AccountPage() {
  const { me, can } = useMe();
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.get<unknown>("/api/org/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `dados-${me.org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast("Arquivo com os dados da conta baixado.", "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setExporting(false); }
  };
  const del = async () => {
    setDeleting(true);
    try {
      await api.del("/api/org", { confirmName });
      window.location.assign("/");
    } catch (e) { toast((e as Error).message, "error"); setDeleting(false); }
  };
  return (
    <>
      <PageHeader title="Conta" description={<>{me.org.name}{me.org.plan && <> · Plano {me.org.plan.name}</>}</>} />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="font-display font-bold">Seus dados</h2>
          <p className="mt-1 text-sm text-ink-muted">{me.user.name} · {me.user.email}</p>
        </Card>
        {can("org.manage") && (
          <>
            <Card>
              <h2 className="font-display font-bold">Exportar dados da conta</h2>
              <p className="mt-1 text-sm text-ink-muted">Baixe um arquivo JSON com produtos, campanhas, lojas e equipe. Custos de produtos fazem parte do arquivo: guarde com cuidado.</p>
              <Button className="mt-3" variant="secondary" loading={exporting} onClick={exportData}>Baixar meus dados</Button>
            </Card>
            <Card className="border-danger/40">
              <h2 className="font-display font-bold text-danger">Excluir conta</h2>
              <p className="mt-1 text-sm text-ink-muted">Remove a conta, as lojas, os produtos e as campanhas. Vitrines saem do ar. Essa ação não pode ser desfeita.</p>
              <Button className="mt-3" variant="danger" onClick={() => setDelOpen(true)}>Excluir conta…</Button>
            </Card>
          </>
        )}
      </div>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title="Excluir conta definitivamente" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>Cancelar</Button><Button variant="danger" loading={deleting} disabled={confirmName.trim() !== me.org.name} onClick={del}>Excluir para sempre</Button></>}>
        <p className="text-sm">Para confirmar, digite o nome da conta: <strong>{me.org.name}</strong></p>
        <div className="mt-3"><Input label="Nome da conta" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" /></div>
      </Dialog>
    </>
  );
}
