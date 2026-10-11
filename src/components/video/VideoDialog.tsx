"use client";
// Vídeo de ofertas: orientação, estilo, duração, áudio e narração, com prévia animada e a lista
// de vídeos gerados (fila com progresso, download, nova tentativa e cancelamento).
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, cx, Dialog, ErrorState, Textarea, toast } from "@/components/ui";
import { Checkbox } from "@/components/app/common";
import { api } from "@/lib/client/api";
import { AUDIO_LABEL, DURATION_LABEL, ORIENTATIONS, VIDEO_DURATIONS, VIDEO_STYLES, type AudioKind, type DurationChoice, type VideoOrientation, type VideoStyle } from "@/render/video/options";
import { NARRATION_MAX_CHARS } from "@/render/video/narration";
import { VideoPlayer, type PlayerScene } from "./VideoPlayer";

interface Preview {
  campaignVersion: number;
  url: string;
  plan: { durationSec: number; scenes: Array<PlayerScene & { repeat: boolean }>; shownCount: number; omitted: Array<{ id: string; name: string }>; warnings: string[] };
  narration: Array<{ key: string; text: string }>;
  blockedReason: string | null;
}
interface Config { included: boolean; planName: string; limitSeconds: number; usedSeconds: number; pendingSeconds: number; remainingSeconds: number; tts: { provider: string; label: string; configured: boolean; voice: string | null } }
export interface VideoJob {
  id: string; orientation: VideoOrientation; styleLabel: string; durationSec: number; audioLabel: string; narration: boolean;
  status: "na_fila" | "processando" | "concluida" | "falhou"; statusLabel: string; canceled: boolean; progress: number; attempts: number;
  error: string | null; warnings: string[]; fileName: string | null; downloadUrl: string | null; playUrl: string | null; createdAt: string; campaignVersion: number;
  result: { bytes: number; width: number; height: number } | null;
}

const fmtMin = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}` : `${s} s`);
const fmtMb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const sceneLabel = (s: PlayerScene, i: number) => (s.kind === "intro" ? "Abertura" : s.kind === "outro" ? "Encerramento" : `Cena ${i}`);
/** ~15 caracteres por segundo de fala em pt-BR */
const fitsScene = (text: string, s: PlayerScene) => text.trim().length <= Math.max(12, (s.end - s.start - 0.4) * 15);

function Choice<T extends string | number>({ value, current, onPick, title, hint }: { value: T; current: T; onPick: (v: T) => void; title: string; hint?: string }) {
  const on = value === current;
  return (
    <button type="button" onClick={() => onPick(value)} aria-pressed={on}
      className={cx("min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm transition-colors", on ? "border-brand bg-brand-soft font-semibold" : "border-line hover:bg-ink/5")}>
      <span className="block">{title}</span>
      {hint && <span className="block text-xs font-normal text-ink-muted">{hint}</span>}
    </button>
  );
}

export function VideoDialog({ open, onClose, campaignId, beforeCreate }: {
  open: boolean; onClose: () => void; campaignId: string; beforeCreate?: () => Promise<void>;
}) {
  const [orientation, setOrientation] = useState<VideoOrientation>("vertical");
  const [style, setStyle] = useState<VideoStyle>("deslizar");
  const [duration, setDuration] = useState<DurationChoice>("auto");
  const [audio, setAudio] = useState<AudioKind>("none");
  const [upload, setUpload] = useState<{ id: string; name: string; durationSec: number } | null>(null);
  const [license, setLicense] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [narrate, setNarrate] = useState(false);
  const [segments, setSegments] = useState<Array<{ key: string; text: string }>>([]);
  const [edited, setEdited] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushed = useRef(false);

  const loadJobs = useCallback(async () => {
    try {
      const r = await api.get<{ videos: VideoJob[] }>(`/api/campaigns/${campaignId}/videos`);
      setJobs(r.videos);
      if (poll.current) clearTimeout(poll.current);
      if (r.videos.some((j) => j.status === "na_fila" || j.status === "processando")) poll.current = setTimeout(() => void loadJobs(), 2000);
      else api.get<Config>("/api/videos/config").then(setConfig).catch(() => undefined);
    } catch { /* lista volta na próxima ação */ }
  }, [campaignId]);

  useEffect(() => {
    if (!open) { if (poll.current) clearTimeout(poll.current); flushed.current = false; return; }
    api.get<Config>("/api/videos/config").then(setConfig).catch((e) => setError((e as Error).message));
    void loadJobs();
    return () => { if (poll.current) clearTimeout(poll.current); };
  }, [open, loadJobs]);

  // prévia: recalcula quando muda orientação, estilo ou duração (a narração sugerida vem junto)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const id = setTimeout(async () => {
      try {
        if (!flushed.current && beforeCreate) { await beforeCreate(); flushed.current = true; }
        const p = await api.post<Preview>(`/api/campaigns/${campaignId}/videos/preview`, { orientation, style, duration });
        if (!alive) return;
        setPreview(p); setPreviewError(null);
        setSegments((cur) => {
          const sameKeys = cur.length === p.narration.length && cur.every((s, i) => s.key === p.narration[i].key);
          if (edited && sameKeys) return cur;
          if (edited && !sameKeys) toast("As cenas mudaram com a nova duração: o texto da narração foi refeito.", "info");
          setEdited(false);
          return p.narration;
        });
      } catch (e) { if (alive) setPreviewError((e as Error).message); }
    }, 250);
    return () => { alive = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId, orientation, style, duration]);

  const sendAudio = async (file: File) => {
    if (!license) { toast("Confirme antes que a loja tem a licença de uso do áudio.", "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("licenseConfirmed", "true");
      const r = await api.upload<{ id: string; name: string; durationSec: number }>("/api/videos/audio", fd);
      setUpload(r);
      toast("Áudio enviado.", "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setUploading(false); }
  };

  const create = async () => {
    setBusy(true); setError(null);
    try {
      if (beforeCreate) await beforeCreate();
      const body = {
        orientation, style, duration,
        audio: audio === "upload" ? { kind: "upload", assetId: upload?.id, licenseConfirmed: license } : { kind: audio },
        narration: narrate ? { provider: "google", segments } : { provider: "none" },
      };
      await api.post<VideoJob>(`/api/campaigns/${campaignId}/videos`, body);
      toast("Vídeo na fila. Você pode fechar esta janela: ele continua sendo gerado.", "success");
      await loadJobs();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const act = async (job: VideoJob, action: "retry" | "cancel" | "delete") => {
    try {
      if (action === "retry") await api.post(`/api/videos/${job.id}/retry`);
      else {
        if (action === "delete" && !window.confirm("Excluir este vídeo? O arquivo será apagado.")) return;
        await api.del(`/api/videos/${job.id}`);
      }
      await loadJobs();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const vertical = orientation === "vertical";
  const plan = preview?.plan;
  const ttsReady = !!config?.tts.configured;
  const audioBlocked = audio === "upload" && (!upload || !license);
  const tooLong = plan && config?.included && plan.durationSec > config.remainingSeconds;
  const productScenes = plan?.scenes ?? [];

  return (
    <Dialog open={open} onClose={onClose} title="Vídeo de ofertas" size="lg">
      <div className="flex flex-col gap-5">
        {config && !config.included && (
          <ErrorState title="Vídeos não incluídos no plano" message={`O plano ${config.planName} não inclui vídeos. Altere o plano da conta para gerar vídeos de ofertas.`} />
        )}
        <div className="grid gap-5 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <section aria-label="Prévia" className="flex flex-col gap-2">
            {previewError ? <ErrorState message={previewError} /> : (
              <VideoPlayer url={preview?.url ?? null} vertical={vertical} duration={plan?.durationSec ?? 0} scenes={productScenes} />
            )}
            {plan && (
              <p className="text-sm"><strong>{plan.durationSec} s</strong> · {plan.shownCount} {plan.shownCount === 1 ? "produto" : "produtos"} · {productScenes.length - 2} {productScenes.length - 2 === 1 ? "cena" : "cenas"} de ofertas</p>
            )}
            {plan && plan.warnings.length > 0 && <ul className="rounded-xl bg-warning/10 p-3 text-sm">{plan.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          </section>

          <section aria-label="Opções" className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Formato</legend>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(ORIENTATIONS) as VideoOrientation[]).map((o) => <Choice key={o} value={o} current={orientation} onPick={setOrientation} title={ORIENTATIONS[o].label} hint={ORIENTATIONS[o].hint} />)}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Animação</legend>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(VIDEO_STYLES) as VideoStyle[]).map((s) => <Choice key={s} value={s} current={style} onPick={setStyle} title={VIDEO_STYLES[s].label} hint={VIDEO_STYLES[s].hint} />)}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Duração</legend>
              <div className="flex flex-wrap gap-2">
                {(["auto", ...VIDEO_DURATIONS] as DurationChoice[]).map((d) => <Choice key={String(d)} value={d} current={duration} onPick={setDuration} title={DURATION_LABEL(d)} />)}
              </div>
              <p className="text-xs text-ink-muted">Automático: pela quantidade de produtos (até 60 s). Destaques aparecem primeiro; o que não couber é avisado acima.</p>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Áudio</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["none", "system", "upload"] as AudioKind[]).map((a) => <Choice key={a} value={a} current={audio} onPick={setAudio} title={AUDIO_LABEL[a]}
                  hint={a === "system" ? "Música original e suave, sem custo de licença" : a === "upload" ? "Arquivo da loja (MP3, M4A, WAV)" : undefined} />)}
              </div>
              {audio === "upload" && (
                <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <Checkbox checked={license} onChange={setLicense} label="Confirmo que a loja tem a licença de uso deste áudio"
                    description="Músicas de rádio, streaming ou de outros artistas exigem autorização. Esta confirmação fica registrada." />
                  <label className={cx("inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border border-line-strong/60 px-3 text-sm font-semibold", (!license || uploading) && "pointer-events-none opacity-50")}>
                    {uploading ? "Enviando…" : upload ? "Trocar arquivo" : "Escolher arquivo de áudio"}
                    <input type="file" accept=".mp3,.m4a,.aac,.wav,.ogg,audio/*" className="sr-only" disabled={!license || uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendAudio(f); }} />
                  </label>
                  {upload && <p className="text-xs text-ink-muted">Enviado: {upload.name} ({upload.durationSec.toString().replace(".", ",")} s). Áudios curtos se repetem; longos são cortados com saída suave.</p>}
                </div>
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Narração</legend>
              <Checkbox checked={narrate && ttsReady} disabled={!ttsReady} onChange={setNarrate}
                label={ttsReady ? `Narrar as ofertas (${config?.tts.label})` : "Narração: não configurado"}
                description={ttsReady ? "O texto vem dos dados da campanha. Revise antes de gerar." : "Peça à equipe técnica para configurar o serviço de voz (veja o README)."} />
              {narrate && ttsReady && plan && (
                <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
                  {segments.map((s, i) => {
                    const sc = productScenes.find((x) => x.key === s.key);
                    const long = sc ? !fitsScene(s.text, sc) : false;
                    return (
                      <Textarea key={s.key} label={sc ? `${sceneLabel(sc, i)} (${(sc.end - sc.start).toFixed(1).replace(".", ",")} s)` : s.key} rows={2} maxLength={NARRATION_MAX_CHARS}
                        value={s.text} hint={long ? "Texto longo para o tempo da cena: será acelerado ou cortado." : undefined}
                        onChange={(e) => { const v = e.target.value; setEdited(true); setSegments((cur) => cur.map((x) => (x.key === s.key ? { ...x, text: v } : x))); }} />
                    );
                  })}
                </div>
              )}
            </fieldset>
            {config?.included && (
              <p className="text-xs text-ink-muted">Plano {config.planName}: restam {fmtMin(config.remainingSeconds)} de vídeo neste mês (de {fmtMin(config.limitSeconds)}).</p>
            )}
            {preview?.blockedReason && <ErrorState title="Ainda não é possível gerar" message={preview.blockedReason} />}
            {tooLong && <p className="text-sm text-danger">Este vídeo ({plan!.durationSec} s) passa do saldo do mês. Escolha uma duração menor.</p>}
            {error && <ErrorState message={error} />}
            <Button onClick={create} loading={busy} disabled={!plan || !config?.included || !!preview?.blockedReason || audioBlocked || !!tooLong} block>Gerar vídeo MP4</Button>
          </section>
        </div>

        <section aria-label="Vídeos gerados" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Vídeos desta campanha</h3>
          {!jobs.length ? <p className="text-sm text-ink-muted">Nenhum vídeo ainda.</p> : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {jobs.map((j) => {
                const active = j.status === "na_fila" || j.status === "processando";
                return (
                  <li key={j.id} className="flex flex-col gap-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={j.status === "concluida" ? "success" : j.status === "falhou" ? "danger" : "brand"}>{j.statusLabel}</Badge>
                      <span className="text-sm font-medium">{j.orientation === "vertical" ? "Vertical" : "Horizontal"} · {j.durationSec} s · {j.styleLabel}</span>
                      <span className="text-xs text-ink-muted">{j.audioLabel}{j.narration ? " + narração" : ""} · versão {j.campaignVersion}</span>
                    </div>
                    {active && (
                      <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
                        <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.max(3, j.progress)}%` }} />
                      </div>
                    )}
                    {active && <p className="text-xs text-ink-muted">{j.status === "na_fila" ? (j.error ?? "Aguardando a vez na fila…") : `Gerando… ${j.progress}%`}</p>}
                    {j.status === "falhou" && j.error && <p className="text-sm text-danger">{j.error}</p>}
                    {j.warnings.length > 0 && <ul className="text-xs text-ink-muted">{j.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
                    {watching === j.id && j.playUrl && (
                      <video src={j.playUrl} controls playsInline className={cx("w-full rounded-xl bg-ink", j.orientation === "vertical" ? "mx-auto max-h-[70vh] max-w-[320px]" : "")} />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {j.downloadUrl && <a href={j.downloadUrl} download={j.fileName ?? true} className="inline-flex h-9 items-center justify-center rounded-xl bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong">Baixar MP4{j.result ? ` (${fmtMb(j.result.bytes)})` : ""}</a>}
                      {j.playUrl && <Button size="sm" variant="secondary" onClick={() => setWatching(watching === j.id ? null : j.id)}>{watching === j.id ? "Fechar" : "Assistir"}</Button>}
                      {j.status === "falhou" && <Button size="sm" variant="secondary" onClick={() => void act(j, "retry")}>Tentar de novo</Button>}
                      {active && <Button size="sm" variant="ghost" onClick={() => void act(j, "cancel")}>Cancelar</Button>}
                      {!active && <Button size="sm" variant="ghost" onClick={() => void act(j, "delete")}>Excluir</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
