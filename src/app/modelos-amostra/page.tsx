// Galeria de desenvolvimento: todos os modelos × formatos com DADOS DE DEMONSTRAÇÃO.
// Usa o mesmo PieceRenderer da prévia e da exportação. Em produção só abre com EV_SHOW_SAMPLES=1.
// Parâmetros: ?formatos=encarte_a4,story&n=12&modelo=feira-da-semana&marca=1 (aplica cores da loja fictícia)
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/render/fonts.css";
import { PieceRenderer } from "@/render/PieceRenderer";
import { FORMATS, FORMAT_IDS, type FormatId } from "@/domain/formats";
import { listTemplates } from "@/templates/registry";
import { demoCampaign } from "@/templates/demo-data";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Modelos (amostra)", robots: { index: false } };

const DEFAULT_FORMATS: FormatId[] = ["encarte_a4", "story", "post_quadrado", "cartaz_a4", "etiqueta_a4"];
const TARGET_W = 300;

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ModelosAmostraPage({ searchParams }: { searchParams: SP }) {
  if (process.env.NODE_ENV === "production" && process.env.EV_SHOW_SAMPLES !== "1") notFound();
  const sp = await searchParams;
  const formats = (one(sp.formatos)?.split(",").filter((f): f is FormatId => (FORMAT_IDS as string[]).includes(f)) ?? DEFAULT_FORMATS);
  const n = Math.max(1, Math.min(60, Number(one(sp.n)) || 12));
  const only = one(sp.modelo);
  const useStore = one(sp.marca) === "1";
  const templates = listTemplates().filter((t) => !only || t.id === only);

  return (
    <main id="conteudo" className="mx-auto max-w-[1600px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <p className="rounded-full bg-highlight px-3 py-1 text-sm font-bold text-ink">DADOS DE DEMONSTRAÇÃO — loja e preços fictícios</p>
      </header>
      <h1 className="font-display text-2xl font-extrabold">Galeria de modelos ({templates.length})</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {n} produtos · formatos: {formats.map((f) => FORMATS[f].label).join(", ")} · {useStore ? "cores da loja aplicadas" : "paleta própria de cada modelo"}
      </p>
      <nav aria-label="Atalhos" className="mt-3 flex flex-wrap gap-2 text-sm">
        {[1, 12, 40].map((k) => <a key={k} className="rounded-lg border border-line-strong/60 bg-surface px-3 py-2 font-semibold hover:bg-brand-soft" href={`?n=${k}${only ? `&modelo=${only}` : ""}`}>{k} produto{k > 1 ? "s" : ""}</a>)}
        <a className="rounded-lg border border-line-strong/60 bg-surface px-3 py-2 font-semibold hover:bg-brand-soft" href={`?formatos=${FORMAT_IDS.join(",")}&n=${n}${only ? `&modelo=${only}` : ""}`}>Todos os 9 formatos</a>
        <a className="rounded-lg border border-line-strong/60 bg-surface px-3 py-2 font-semibold hover:bg-brand-soft" href={`?n=${n}&marca=${useStore ? 0 : 1}`}>{useStore ? "Usar paleta do modelo" : "Aplicar cores da loja"}</a>
      </nav>

      <div className="mt-6 flex flex-col gap-10">
        {templates.map((t) => {
          const campaign = demoCampaign(n, { withLogo: false });
          if (!useStore) campaign.brand.colors = { ...t.palette };
          return (
            <section key={t.id} aria-labelledby={`t-${t.id}`} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <h2 id={`t-${t.id}`} className="font-display text-lg font-extrabold">{t.name} <span className="text-sm font-medium text-ink-muted">· {t.id} v{t.version} · {t.segments.join(", ")} · {t.style}</span></h2>
              <p className="mb-3 text-sm text-ink-muted">{t.description}</p>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {formats.map((f) => {
                  const spec = FORMATS[f];
                  const scale = TARGET_W / spec.widthPx;
                  return (
                    <figure key={f} className="m-0 shrink-0">
                      <div style={{ width: TARGET_W, height: Math.round(spec.heightPx * scale), overflow: "hidden", borderRadius: 8, boxShadow: "0 1px 6px rgba(0,0,0,.15)" }}>
                        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: spec.widthPx }}>
                          <PieceRenderer campaign={campaign} template={t} format={f} pageIndex={0} />
                        </div>
                      </div>
                      <figcaption className="mt-1 text-xs font-semibold text-ink-muted">{spec.label}</figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
