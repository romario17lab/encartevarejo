"use client";
// Gestão de uma tela: aparelho (pareamento/link/desconectar), ajustes, programação com agendamento e prévia do que toca agora.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ErrorState, Input, Select, cx, toast } from "@/components/ui";
import { LoadingBlock, PageHeader, confirmAction } from "@/components/app/common";
import { useApi, useMe } from "@/lib/client/hooks";
import { api, ApiError } from "@/lib/client/api";
import type { TvPlaylist } from "@/server/tv/types";
import { TvDevicePanel } from "./TvDevicePanel";
import { CampaignSlide } from "./TvSlide";
import { buildSlides } from "./TvPlayer";
import { fmtDate, screenStatus, type TvPlaylistRow, type TvScreenDetail } from "./types";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const STATE_BADGE = { no_ar: { tone: "success", label: "No ar agora" }, agendado: { tone: "accent", label: "Agendado" }, fora: { tone: "neutral", label: "Não toca" } } as const;

function scheduleSummary(r: TvPlaylistRow, slideSeconds: number) {
  const parts: string[] = [];
  parts.push(r.daysOfWeek?.length ? r.daysOfWeek.map((d) => DAYS[d]).join(", ") : "Todos os dias");
  parts.push(r.hours ? r.hours.replace(/-/g, "–").replace(/,/g, ", ") : "o dia todo");
  if (r.startDate || r.endDate) parts.push(r.startDate && r.endDate ? `de ${fmtYmd(r.startDate)} a ${fmtYmd(r.endDate)}` : r.startDate ? `a partir de ${fmtYmd(r.startDate)}` : `até ${fmtYmd(r.endDate!)}`);
  parts.push(r.kind === "video" ? (r.durationSec ? `até ${r.durationSec} s` : "vídeo inteiro") : `${r.durationSec ?? slideSeconds} s por slide`);
  return parts.join(" · ");
}
const fmtYmd = (ymd: string) => ymd.split("-").reverse().join("/");

export function TvScreenEditor({ id }: { id: string }) {
  const q = useApi<TvScreenDetail>(`/api/tv/screens/${id}`);
  const preview = useApi<TvPlaylist>(`/api/tv/screens/${id}/preview`);
  const [rows, setRows] = useState<TvPlaylistRow[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [pick, setPick] = useState("");
  const canWrite = useMe().can("campaigns.write");
  const d = q.data;

  useEffect(() => { if (d && !dirty) setRows(d.items); }, [d, dirty]);

  const reloadAll = useCallback(async () => { await Promise.all([q.reload(), preview.reload()]); }, [q, preview]);
  const edit = (fn: (r: TvPlaylistRow[]) => TvPlaylistRow[]) => { setRows((prev) => fn(prev ?? [])); setDirty(true); setError(null); };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (!rows || j < 0 || j >= rows.length) return;
    edit((r) => { const c = [...r]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
    setOpen((o) => (o === i ? j : o === j ? i : o));
  };
  const update = (i: number, patch: Partial<TvPlaylistRow>) => edit((r) => r.map((x, k) => (k === i ? { ...x, ...patch, state: undefined, reason: undefined } : x)));

  const options = useMemo(() => {
    if (!d) return [];
    const st: Record<string, string> = { publicada: "publicada", agendada: "agendada" };
    return [
      ...d.candidates.campaigns.map((c) => ({ value: `c:${c.id}`, label: `${c.name} (${st[c.status] ?? c.status}${c.endsAt ? `, até ${fmtDate(c.endsAt)}` : ""})` })),
      ...d.candidates.videos.map((v) => ({ value: `v:${v.id}`, label: `${v.name} (${v.durationSec} s, ${v.orientation === "vertical" ? "vertical" : "horizontal"})` })),
    ];
  }, [d]);

  const add = () => {
    if (!d || !pick) return;
    const [kind, pid] = [pick.slice(0, 1), pick.slice(2)];
    if (kind === "c") {
      const c = d.candidates.campaigns.find((x) => x.id === pid);
      if (c) edit((r) => [...r, { kind: "campaign", campaignId: c.id, videoJobId: null, name: c.name, durationSec: null, startDate: null, endDate: null, daysOfWeek: null, hours: null }]);
    } else {
      const v = d.candidates.videos.find((x) => x.id === pid);
      if (v) edit((r) => [...r, { kind: "video", campaignId: v.campaignId, videoJobId: v.id, name: v.name, durationSec: null, startDate: null, endDate: null, daysOfWeek: null, hours: null }]);
    }
    setPick("");
  };

  const save = async () => {
    if (!rows) return;
    setSaving(true); setError(null);
    try {
      const items = rows.map((r) => ({
        kind: r.kind, campaignId: r.kind === "campaign" ? r.campaignId : null, videoJobId: r.videoJobId,
        durationSec: r.durationSec, startDate: r.startDate || null, endDate: r.endDate || null, daysOfWeek: r.daysOfWeek, hours: r.hours?.trim() || null,
      }));
      const fresh = await api.put<TvScreenDetail>(`/api/tv/screens/${id}/playlist`, { items });
      q.setData(fresh);
      setRows(fresh.items);
      setDirty(false);
      toast("Programação salva. A TV atualiza em até 1 minuto.", "success");
      void preview.reload();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Não foi possível salvar."); } finally { setSaving(false); }
  };

  if (q.loading && !d) return <LoadingBlock />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!d || !rows) return null;
  const s = d.screen;
  const st = screenStatus(s);

  return (
    <>
      <PageHeader title={s.name} back={{ href: "/app/tv", label: "TV da loja" }}
        description={<span className="inline-flex flex-wrap items-center gap-2">{s.storeName} · {s.orientation === "vertical" ? "vertical" : "horizontal"} · {s.slideSeconds} s por slide <Badge tone={st.tone}>{st.label}</Badge></span>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Programação</h2>
              {canWrite && <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>{dirty ? "Salvar programação" : "Salva"}</Button>}
            </div>
            <p className="mb-3 text-sm text-ink-muted">Toca em ordem, em repetição. Só entram campanhas publicadas e dentro da validade; ofertas vencidas saem sozinhas.</p>
            {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger">{error}</p>}
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-muted">Nada na programação. Adicione uma campanha publicada abaixo.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {rows.map((r, i) => {
                  const badge = r.state ? STATE_BADGE[r.state] : null;
                  const expanded = open === i;
                  return (
                    <li key={`${r.id ?? "novo"}-${i}`} className="rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/5 text-sm font-bold">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight">{r.name}</p>
                          <p className="mt-0.5 text-xs text-ink-muted">{scheduleSummary(r, s.slideSeconds)}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                            {r.reason && <Badge tone="warning">{r.reason}</Badge>}
                            {!r.state && <Badge>Não salvo</Badge>}
                          </div>
                        </div>
                      </div>
                      {canWrite && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button size="sm" variant="secondary" aria-label={`Subir ${r.name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑ Subir</Button>
                          <Button size="sm" variant="secondary" aria-label={`Descer ${r.name}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓ Descer</Button>
                          <Button size="sm" variant={expanded ? "primary" : "secondary"} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>Agendar</Button>
                          <Button size="sm" variant="ghost" className="text-danger" onClick={() => { edit((x) => x.filter((_, k) => k !== i)); setOpen(null); }}>Remover</Button>
                        </div>
                      )}
                      {canWrite && expanded && <ScheduleFields row={r} slideSeconds={s.slideSeconds} onChange={(p) => update(i, p)} />}
                    </li>
                  );
                })}
              </ol>
            )}
            {canWrite && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Select label="Adicionar à programação" value={pick} onChange={(e) => setPick(e.target.value)}
                    options={[{ value: "", label: options.length ? "Escolha uma campanha ou vídeo…" : "Nenhuma campanha publicada ou agendada desta loja" }, ...options]} />
                </div>
                <Button variant="secondary" disabled={!pick} onClick={add}>Adicionar</Button>
              </div>
            )}
            {canWrite && dirty && (
              <div className="sticky bottom-2 mt-3 flex justify-end">
                <Button loading={saving} onClick={() => void save()} className="shadow-lg">Salvar programação</Button>
              </div>
            )}
          </Card>
          <PreviewCard data={preview.data} loading={preview.loading} error={preview.error?.message ?? null} onReload={() => void preview.reload()} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="mb-3 font-display text-lg font-bold">Aparelho</h2>
            <TvDevicePanel screen={s} canWrite={canWrite} onChanged={() => void reloadAll()} />
          </Card>
          {canWrite && <SettingsCard id={id} detail={d} onSaved={(fresh) => { q.setData(fresh); void preview.reload(); }} />}
        </div>
      </div>
    </>
  );
}

function ScheduleFields({ row, slideSeconds, onChange }: { row: TvPlaylistRow; slideSeconds: number; onChange: (p: Partial<TvPlaylistRow>) => void }) {
  const days = row.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onChange({ daysOfWeek: next.length === 7 ? null : next });
  };
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-surface-alt p-3 sm:grid-cols-2">
      <Input label={row.kind === "video" ? "Tempo máximo (s)" : "Segundos por slide"} type="number" inputMode="numeric" min={3} max={600}
        placeholder={row.kind === "video" ? "vídeo inteiro" : String(slideSeconds)} value={row.durationSec ?? ""}
        onChange={(e) => onChange({ durationSec: e.target.value ? Math.round(Number(e.target.value)) : null })} hint="Vazio = padrão" />
      <Input label="Horários" placeholder="08:00-12:00" value={row.hours ?? ""} onChange={(e) => onChange({ hours: e.target.value || null })}
        hint="Vazio = o dia todo. Várias faixas: 08:00-12:00,17:00-21:00" />
      <Input label="Data inicial" type="date" value={row.startDate ?? ""} onChange={(e) => onChange({ startDate: e.target.value || null })} />
      <Input label="Data final" type="date" value={row.endDate ?? ""} onChange={(e) => onChange({ endDate: e.target.value || null })} />
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Dias da semana</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((label, d) => (
            <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggle(d)}
              className={cx("h-11 min-w-[48px] rounded-xl border px-2 text-sm font-semibold", days.includes(d) ? "border-brand bg-brand text-white" : "border-line-strong/60 bg-surface text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted sm:col-span-2">Horário de Brasília. A campanha também respeita a própria validade.</p>
    </div>
  );
}

function SettingsCard({ id, detail, onSaved }: { id: string; detail: TvScreenDetail; onSaved: (d: TvScreenDetail) => void }) {
  const s = detail.screen;
  const [name, setName] = useState(s.name);
  const [orientation, setOrientation] = useState(s.orientation);
  const [seconds, setSeconds] = useState(String(s.slideSeconds));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onSaved(await api.patch<TvScreenDetail>(`/api/tv/screens/${id}`, { name, orientation, slideSeconds: Number(seconds) || s.slideSeconds })); toast("Ajustes salvos.", "success"); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Não foi possível salvar.", "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirmAction(`Excluir a tela "${s.name}"? A programação dela também será apagada e o aparelho para de tocar.`)) return;
    try { await api.del(`/api/tv/screens/${id}`); window.location.assign("/app/tv"); } catch (e) { toast(e instanceof ApiError ? e.message : "Não foi possível excluir.", "error"); }
  };
  return (
    <Card>
      <h2 className="mb-3 font-display text-lg font-bold">Ajustes da tela</h2>
      <div className="flex flex-col gap-3">
        <Input label="Nome" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Select label="Posição da TV" value={orientation} onChange={(e) => setOrientation(e.target.value as "horizontal" | "vertical")}
          options={[{ value: "horizontal", label: "Horizontal (1920×1080)" }, { value: "vertical", label: "Vertical (1080×1920)" }]} />
        <Input label="Segundos por slide" type="number" inputMode="numeric" min={4} max={120} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={() => void save()}>Salvar ajustes</Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove()}>Excluir tela</Button>
        </div>
      </div>
    </Card>
  );
}

function PreviewCard({ data, loading, error, onReload }: { data: TvPlaylist | undefined; loading: boolean; error: string | null; onReload: () => void }) {
  const slides = useMemo(() => (data ? buildSlides(data, new Date()) : []), [data]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [data]);
  const cur = slides[Math.min(i, Math.max(0, slides.length - 1))];
  const vertical = data?.screen.orientation === "vertical";
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Prévia: o que toca agora</h2>
        <Button size="sm" variant="ghost" onClick={onReload} loading={loading}>Atualizar</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : !slides.length ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-muted">{loading ? "Carregando…" : "Nada toca neste horário. A TV mostra o relógio e o nome da loja."}</p>
      ) : cur && (
        <>
          <div className={cx("relative mx-auto w-full overflow-hidden rounded-xl bg-black", vertical ? "max-w-[280px]" : "")} style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }} data-tv-preview="">
            {cur.kind === "campaign" ? <CampaignSlide key={cur.key} item={cur.item} page={cur.page} /> : (
              <video key={cur.key} src={cur.item.url} muted controls playsInline className="absolute inset-0 h-full w-full object-contain" />
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button size="sm" variant="secondary" onClick={() => setI((x) => (x - 1 + slides.length) % slides.length)} aria-label="Slide anterior" className="shrink-0 whitespace-nowrap">‹ Anterior</Button>
            <p className="min-w-0 truncate text-center text-sm text-ink-muted">
              {i + 1} de {slides.length} · {cur.item.name}{cur.kind === "campaign" && cur.item.pages > 1 ? ` (página ${cur.page + 1})` : ""}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setI((x) => (x + 1) % slides.length)} aria-label="Próximo slide" className="shrink-0 whitespace-nowrap">Próximo ›</Button>
          </div>
        </>
      )}
    </Card>
  );
}
