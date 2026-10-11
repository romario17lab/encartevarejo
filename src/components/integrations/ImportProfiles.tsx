"use client";
import { useState } from "react";
import { Badge, Button, Card, Input, Select, toast } from "@/components/ui";
import { confirmAction } from "@/components/app/common";
import { IconUpload } from "@/components/app/icons";
import { api, ApiError, type ImportResult } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { useApi } from "@/lib/client/hooks";

// Perfis de importação (colunas salvas) para reimportar a exportação do sistema de gestão em um passo.

export type Mapping = Record<string, string | null>;
export type OnDuplicate = "skip" | "update" | "create";
export interface ImportProfile { id: string; name: string; mapping: Record<string, string>; onDuplicate: OnDuplicate; createdAt: string; updatedAt: string; lastUsedAt?: string | null }
export interface ExampleLayout { key: string; name: string; description: string; columns: string[]; mapping: Record<string, string>; onDuplicate: OnDuplicate }
interface ProfilesResponse { profiles: ImportProfile[]; examples: ExampleLayout[] }

const DUP_LABEL: Record<OnDuplicate, string> = { skip: "pula existentes", update: "atualiza existentes", create: "cria sempre" };

export function useImportProfiles() {
  return useApi<ProfilesResponse>("/api/products/import/profiles");
}

/** Importação em um passo com um perfil salvo. */
export function ProfileQuickRun({ data, reload, onResult }: { data: ProfilesResponse; reload: () => Promise<void>; onResult: (r: ImportResult & { profile: { name: string } }) => void }) {
  const [profileId, setProfileId] = useState(data.profiles[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; missing?: string[] } | null>(null);
  if (!data.profiles.length) return null;
  const run = async () => {
    if (!file || !profileId) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api.upload<ImportResult & { profile: { name: string } }>(`/api/products/import/profiles/${profileId}/run`, fd);
      await reload();
      onResult(r);
    } catch (e) {
      const d = e instanceof ApiError ? (e.details as { missingColumns?: string[] } | undefined) : undefined;
      setError({ message: (e as Error).message, missing: d?.missingColumns });
    } finally { setBusy(false); }
  };
  return (
    <Card className="mb-4">
      <h2 className="font-display text-lg font-bold">Importar com perfil salvo</h2>
      <p className="mt-1 text-sm text-ink-muted">Para a exportação que você já importou antes: escolha o perfil e o arquivo novo. Usamos as mesmas colunas e a mesma regra para produtos existentes.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Select label="Perfil" value={profileId} onChange={(e) => setProfileId(e.target.value)}
          options={data.profiles.map((p) => ({ value: p.id, label: `${p.name} (${DUP_LABEL[p.onDuplicate]})` }))} />
        <div className="flex flex-col gap-1">
          <label htmlFor="profile-file" className="text-sm font-medium">Arquivo CSV ou XLSX</label>
          <input id="profile-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm file:mr-3 file:h-11 file:rounded-xl file:border file:border-line file:bg-surface file:px-3 file:font-semibold"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-semibold text-danger">{error.message}</p>
          {error.missing && <p className="mt-1 text-ink-muted">Se o sistema mudou o nome das colunas, importe abaixo escolhendo as colunas e salve um perfil novo.</p>}
        </div>
      )}
      <div className="mt-3 flex justify-end"><Button icon={<IconUpload size={18} />} loading={busy} disabled={!file || !profileId} onClick={run}>Importar agora</Button></div>
    </Card>
  );
}

/** Aplica as colunas de um perfil salvo ou de um leiaute de exemplo ao mapeamento atual. */
export function ApplyProfileSelect({ data, columns, onApply }: { data: ProfilesResponse; columns: string[]; onApply: (m: Mapping, onDuplicate: OnDuplicate, missing: string[]) => void }) {
  const options = [
    ...data.profiles.map((p) => ({ value: `p:${p.id}`, label: `Perfil: ${p.name}` })),
    ...data.examples.map((x) => ({ value: `x:${x.key}`, label: x.name })),
  ];
  return (
    <Select label="Usar colunas de um perfil ou exemplo" value="" options={[{ value: "", label: "— Escolher —" }, ...options]}
      hint="Os exemplos são leiautes genéricos de exportação; confira os nomes das colunas do seu arquivo."
      onChange={(e) => {
        const v = e.target.value;
        const src = v.startsWith("p:") ? data.profiles.find((p) => `p:${p.id}` === v) : data.examples.find((x) => `x:${x.key}` === v);
        if (!src) return;
        const m: Mapping = {};
        const missing: string[] = [];
        for (const [field, col] of Object.entries(src.mapping)) {
          if (columns.includes(col)) m[field] = col; else missing.push(col);
        }
        onApply(m, src.onDuplicate, missing);
      }} />
  );
}

/** Salva o mapeamento atual como perfil. */
export function SaveProfileForm({ mapping, onDuplicate, onSaved }: { mapping: Mapping; onDuplicate: OnDuplicate; onSaved?: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  if (saved) return <p role="status" className="text-sm text-success">Perfil “{saved}” salvo. Na próxima vez, use “Importar com perfil salvo”.</p>;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1"><Input label="Salvar estas colunas como perfil" placeholder="Ex.: Exportação semanal do sistema" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <Button variant="secondary" loading={busy} disabled={name.trim().length < 2 || !mapping.name} onClick={async () => {
        setBusy(true);
        try {
          const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
          await api.post("/api/products/import/profiles", { name: name.trim(), mapping: clean, onDuplicate });
          setSaved(name.trim()); onSaved?.();
        } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
      }}>Salvar perfil</Button>
    </div>
  );
}

/** Lista de perfis salvos (excluir). */
export function ProfilesList({ data, reload }: { data: ProfilesResponse; reload: () => Promise<void> }) {
  if (!data.profiles.length) return null;
  return (
    <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">Perfis salvos ({data.profiles.length})</summary>
      <ul className="mt-3 divide-y divide-line">
        {data.profiles.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{p.name} <Badge>{DUP_LABEL[p.onDuplicate]}</Badge></p>
              <p className="break-words text-xs text-ink-muted">Colunas: {Object.values(p.mapping).join(", ")}</p>
              <p className="text-xs text-ink-muted">{p.lastUsedAt ? `Usado ${fmtDateTime(p.lastUsedAt)}` : "Ainda não usado"}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!confirmAction(`Excluir o perfil "${p.name}"?`)) return;
              try { await api.del(`/api/products/import/profiles/${p.id}`); await reload(); } catch (e) { toast((e as Error).message, "error"); }
            }}>Excluir</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
