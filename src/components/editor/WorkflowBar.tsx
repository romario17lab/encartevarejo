"use client";
import { useState } from "react";
import { Button, Dialog, Input, Textarea, toast } from "@/components/ui";
import { StatusBadge } from "@/components/app/common";
import type { CampaignStatus, Permission } from "@/domain/campaign";
import { api, type CampaignCore } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";

type Action = "submit" | "approve" | "reject" | "publish" | "schedule" | "unpublish" | "end";
const LABEL: Record<Action, string> = {
  submit: "Enviar para revisão", approve: "Aprovar", reject: "Reprovar", publish: "Publicar", schedule: "Agendar", unpublish: "Tirar da vitrine", end: "Encerrar",
};
const PERM: Record<Action, Permission> = {
  submit: "campaigns.submit", approve: "campaigns.approve", reject: "campaigns.approve", publish: "campaigns.publish", schedule: "campaigns.publish", unpublish: "campaigns.publish", end: "campaigns.publish",
};
const BY_STATUS: Record<CampaignStatus, Action[]> = {
  rascunho: ["submit"],
  em_revisao: ["approve", "reject"],
  aprovada: ["publish", "schedule"],
  agendada: ["publish", "unpublish"],
  publicada: ["end", "unpublish"],
  encerrada: [],
};

export function WorkflowBar({ campaign, can, hasErrors, beforeAction, afterAction }: {
  campaign: CampaignCore; can: (p: Permission) => boolean; hasErrors: boolean;
  beforeAction: () => Promise<void>; afterAction: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [when, setWhen] = useState("");
  const actions = BY_STATUS[campaign.status].filter((a) => can(PERM[a]));
  const approvedOnce = campaign.approvedVersion != null;
  const needsReapproval = campaign.needsReapproval ?? (approvedOnce && campaign.approvedHash != null && campaign.contentHash != null && campaign.approvedHash !== campaign.contentHash);

  const run = async (a: Action, body: Record<string, unknown> = {}) => {
    setBusy(a);
    try {
      await beforeAction();
      await api.post(`/api/campaigns/${campaign.id}/${a}`, body);
      toast(({ submit: "Enviada para revisão.", approve: "Campanha aprovada.", reject: "Campanha reprovada e devolvida para edição.", publish: "Campanha publicada.", schedule: "Publicação agendada.", unpublish: "Campanha retirada da vitrine.", end: "Campanha encerrada." } as const)[a], "success");
      setRejectOpen(false); setSchedOpen(false); setReason("");
      await afterAction();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={campaign.status} />
        {campaign.status === "agendada" && campaign.scheduledPublishAt && <span className="text-xs text-ink-muted">Publica em {fmtDateTime(campaign.scheduledPublishAt)}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a} size="sm" variant={a === "reject" || a === "unpublish" || a === "end" ? "secondary" : "primary"} loading={busy === a}
              disabled={!!busy || ((a === "submit" || a === "approve" || a === "publish" || a === "schedule") && hasErrors)}
              title={hasErrors ? "Corrija os erros dos produtos antes" : undefined}
              onClick={() => (a === "reject" ? setRejectOpen(true) : a === "schedule" ? setSchedOpen(true) : run(a))}>
              {LABEL[a]}
            </Button>
          ))}
        </div>
      </div>
      {(approvedOnce || ["aprovada", "agendada", "publicada"].includes(campaign.status)) && (
        <p role="note" className={`rounded-xl px-3 py-2 text-xs ${needsReapproval ? "bg-warning/15 font-semibold" : "bg-brand-soft"}`}>
          {needsReapproval ? "Houve alterações de produtos, preços, condições ou datas depois da aprovação. É preciso aprovar de novo antes de publicar ou exportar." : "Alterações de preço após a aprovação exigem nova aprovação."}
        </p>
      )}
      {hasErrors && actions.some((a) => a !== "reject" && a !== "unpublish" && a !== "end") && <p className="text-xs text-danger">Há erros na lista de Avisos (preços, unidades ou datas). Corrija-os para continuar.</p>}

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reprovar campanha" size="sm"
        footer={<><Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancelar</Button><Button variant="danger" loading={busy === "reject"} disabled={reason.trim().length < 3} onClick={() => run("reject", { note: reason.trim() })}>Reprovar</Button></>}>
        <Textarea label="Motivo (a equipe verá esta mensagem)" required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex.: O preço do arroz está errado, o certo é R$ 22,90." />
      </Dialog>
      <Dialog open={schedOpen} onClose={() => setSchedOpen(false)} title="Agendar publicação" size="sm"
        footer={<><Button variant="secondary" onClick={() => setSchedOpen(false)}>Cancelar</Button><Button loading={busy === "schedule"} disabled={!when} onClick={() => run("schedule", { at: new Date(when).toISOString() })}>Agendar</Button></>}>
        <Input label="Publicar em" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} hint="A campanha entra na vitrine automaticamente nesse horário." />
      </Dialog>
    </div>
  );
}
