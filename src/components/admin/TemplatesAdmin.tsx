"use client";
import { useState } from "react";
import { Badge, Button, Card, Dialog, Input, Textarea, toast } from "@/components/ui";
import { Checkbox, LoadingBlock } from "@/components/app/common";
import { TemplateThumb } from "@/components/editor/TemplateGallery";
import { STATUS_LABEL, type CampaignStatus } from "@/domain/campaign";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtDateTime } from "@/lib/client/format";
import { AdminPageHeader, fmtInt, QueryView, TableWrap, td, th } from "./shared";

interface AdminVersion { version: number; name: string; isPublished: boolean; releaseNotes: string | null; releaseChangedAt: string | null; campaignCount: number; isLatestPublished: boolean }
interface AdminTemplate {
  id: string; name: string; description?: string; style?: string; category: string | null; isActive: boolean; sortOrder: number;
  latestVersion: number; latestPublishedVersion: number | null; offeredToNewCampaigns: boolean; campaignCount: number; versions: AdminVersion[];
}
interface Data { templates: AdminTemplate[]; categories: string[]; outdatedCampaigns: number }

export function TemplatesAdmin() {
  const q = useApi<Data>("/api/admin/templates");
  const [release, setRelease] = useState<{ t: AdminTemplate; v: AdminVersion } | null>(null);
  const [campaigns, setCampaigns] = useState<{ t: AdminTemplate; version: number } | null>(null);
  return (
    <div>
      <AdminPageHeader title="Modelos e categorias"
        description={<>Publicar uma versão a oferece para campanhas <strong>novas</strong>. Campanhas existentes nunca mudam de versão sozinhas: o cliente vê o aviso de versão nova no editor e decide migrar.</>} />
      <QueryView q={q} empty={{ title: "Nenhum modelo registrado", description: "Os modelos ficam no código (src/templates)." }} isEmpty={(d) => !d.templates.length} loadingLabel="Carregando modelos…">
        {(d) => (
          <>
            {d.outdatedCampaigns > 0 && (
              <p className="mb-4 rounded-xl border border-line bg-surface p-3 text-sm">
                <strong className="ev-num">{fmtInt(d.outdatedCampaigns)}</strong> campanha(s) usam uma versão anterior à última publicada do seu modelo. Elas continuam renderizando como foram criadas; a migração é feita pelo cliente, de forma explícita, no editor.
              </p>
            )}
            <datalist id="admin-template-categories">{d.categories.map((c) => <option key={c} value={c} />)}</datalist>
            <ul className="flex flex-col gap-4">
              {d.templates.map((t) => (
                <li key={t.id}>
                  <TemplateCard t={t} onSaved={() => void q.reload()} onRelease={(v) => setRelease({ t, v })} onCampaigns={(version) => setCampaigns({ t, version })} />
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
      {release && <ReleaseDialog t={release.t} v={release.v} onClose={() => setRelease(null)} onDone={() => { setRelease(null); void q.reload(); }} />}
      {campaigns && <CampaignsDialog t={campaigns.t} version={campaigns.version} onClose={() => setCampaigns(null)} />}
    </div>
  );
}

function TemplateCard({ t, onSaved, onRelease, onCampaigns }: { t: AdminTemplate; onSaved: () => void; onRelease: (v: AdminVersion) => void; onCampaigns: (version: number) => void }) {
  const [f, setF] = useState({ category: t.category ?? "", isActive: t.isActive, sortOrder: String(t.sortOrder) });
  const [saving, setSaving] = useState(false);
  const dirty = f.category !== (t.category ?? "") || f.isActive !== t.isActive || f.sortOrder !== String(t.sortOrder);
  const orderErr = !/^-?\d{1,4}$/.test(f.sortOrder) || Math.abs(Number(f.sortOrder)) > 1000 ? "Use um número inteiro entre -1000 e 1000." : null;
  const save = async () => {
    if (orderErr) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/templates/${t.id}`, { category: f.category.trim() || null, isActive: f.isActive, sortOrder: Number(f.sortOrder) });
      toast("Modelo atualizado.", "success");
      onSaved();
    } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const latest = t.versions.find((v) => v.isLatestPublished) ?? t.versions[0]!;
  return (
    <Card className="p-0">
      <div className="flex flex-col gap-4 p-4 md:flex-row">
        <div className="w-28 shrink-0 self-start sm:w-32">
          <TemplateThumb t={{ id: t.id, version: latest.version, name: t.name }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">{t.name}</h2>
            <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">{t.id}</code>
            {t.offeredToNewCampaigns ? <Badge tone="success">Na galeria · v{t.latestPublishedVersion}</Badge> : <Badge tone="warning">Fora da galeria</Badge>}
            {t.category && <Badge tone="brand">{t.category}</Badge>}
          </div>
          {t.description && <p className="mt-1 text-sm text-ink-muted">{t.description}</p>}
          <p className="mt-1 text-xs text-ink-muted">{fmtInt(t.campaignCount)} campanha(s) usam este modelo (todas as contas).</p>
          <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Input label="Categoria" list="admin-template-categories" maxLength={40} value={f.category} placeholder="Ex.: Hortifrúti" onChange={(e) => setF({ ...f, category: e.target.value })} />
            <Input label="Ordem" inputMode="numeric" value={f.sortOrder} error={orderErr} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
            <div className="pb-1"><Checkbox label="Ativo na galeria" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} /></div>
            <Button type="submit" variant="secondary" size="sm" loading={saving} disabled={!dirty || !!orderErr}>Salvar</Button>
          </form>
          {!f.isActive && t.isActive && <p className="mt-2 text-xs text-ink-muted">Desativar tira o modelo da galeria e de campanhas novas. Campanhas existentes continuam usando o modelo normalmente.</p>}
        </div>
      </div>
      <TableWrap label={`Versões do modelo ${t.name}`}>
        <thead><tr><th className={th}>Versão</th><th className={th}>Situação</th><th className={th}>Campanhas</th><th className={th}>Observação</th><th className={th}><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {t.versions.map((v) => (
            <tr key={v.version}>
              <td className={td}><span className="font-semibold">v{v.version}</span>{v.isLatestPublished && <span className="ml-2"><Badge tone="brand">usada em campanhas novas</Badge></span>}</td>
              <td className={td}>{v.isPublished ? <Badge tone="success">Publicada</Badge> : <Badge tone="warning">Despublicada</Badge>}</td>
              <td className={td}>
                {v.campaignCount ? <button type="button" className="font-semibold text-brand-strong underline-offset-2 hover:underline" onClick={() => onCampaigns(v.version)}>{fmtInt(v.campaignCount)} — ver</button> : "0"}
              </td>
              <td className={td}><span className="text-xs text-ink-muted">{v.releaseNotes ?? "—"}{v.releaseChangedAt ? ` · ${fmtDateTime(v.releaseChangedAt)}` : ""}</span></td>
              <td className={`${td} text-right`}>
                <Button size="sm" variant={v.isPublished ? "ghost" : "secondary"} onClick={() => onRelease(v)}>{v.isPublished ? "Despublicar" : "Publicar"}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </Card>
  );
}

function ReleaseDialog({ t, v, onClose, onDone }: { t: AdminTemplate; v: AdminVersion; onClose: () => void; onDone: () => void }) {
  const publish = !v.isPublished;
  const [notes, setNotes] = useState(v.releaseNotes ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.put(`/api/admin/templates/${t.id}/versions/${v.version}`, { isPublished: publish, notes });
      toast(publish ? `Versão ${v.version} publicada.` : `Versão ${v.version} despublicada.`, "success");
      onDone();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`${publish ? "Publicar" : "Despublicar"} ${t.name} v${v.version}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={publish ? "primary" : "danger"} loading={busy} onClick={() => void submit()}>{publish ? "Publicar versão" : "Despublicar versão"}</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        {publish ? (
          <p>Esta versão passa a ser oferecida para campanhas novas{v.version > (t.latestPublishedVersion ?? 0) ? " e aparece como versão nova no editor das campanhas existentes, que podem migrar se o cliente quiser" : ""}.</p>
        ) : (
          <p>Campanhas novas deixam de usar esta versão. <strong>{fmtInt(v.campaignCount)} campanha(s)</strong> que já usam a v{v.version} continuam nela, sem nenhuma alteração.</p>
        )}
        <Textarea label="Observação (opcional)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: ajuste no rodapé; revisão de contraste" />
      </div>
    </Dialog>
  );
}

interface CampaignRow { id: string; name: string; status: CampaignStatus; templateVersion: number; updatedAt: string; orgId: string; orgName: string }
function CampaignsDialog({ t, version, onClose }: { t: AdminTemplate; version: number; onClose: () => void }) {
  const q = useApi<{ campaigns: CampaignRow[] }>(`/api/admin/templates/${t.id}/campaigns?version=${version}`);
  return (
    <Dialog open size="lg" onClose={onClose} title={`Campanhas em ${t.name} v${version}`}>
      <p className="mb-3 text-sm text-ink-muted">Somente consulta. A administração não migra campanhas: cada cliente decide no editor.</p>
      {q.loading ? <LoadingBlock /> : (
        <QueryView q={q} empty={{ title: "Nenhuma campanha nesta versão" }} isEmpty={(d) => !d.campaigns.length}>
          {(d) => (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {d.campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="font-semibold">{c.name}</span> <span className="text-ink-muted">· {c.orgName}</span></span>
                  <span className="text-xs text-ink-muted">{STATUS_LABEL[c.status] ?? c.status} · atualizada {fmtDateTime(c.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      )}
    </Dialog>
  );
}
