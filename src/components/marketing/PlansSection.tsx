// Planos na página comercial. Recursos e limites vêm de DEFAULT_PLANS (os mesmos do seed); sem preços:
// os valores comerciais ainda serão definidos pelo dono na administração.
import Link from "next/link";
import { DEFAULT_PLANS, FEATURE_LABEL } from "@/server/services/plans";

const PLAN_FOR: Record<string, string> = {
  inicial: "Para uma loja que quer fazer o encarte e as peças da semana sem depender de terceiros.",
  profissional: "Para quem tem mais de uma loja, agenda campanhas e usa vídeo e TV da loja.",
  redes: "Para redes com várias filiais e agências que atendem vários clientes, com aprovação em etapas.",
};

const n = (v: number) => v.toLocaleString("pt-BR");
const gb = (mb: number) => (mb >= 1024 ? `${n(Math.round(mb / 1024))} GB` : `${n(mb)} MB`);
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

export function PlansSection() {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-4">
      <h2 id="planos-titulo" className="font-display text-2xl font-extrabold sm:text-3xl">Planos</h2>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Três planos com os mesmos modelos e formatos de peça. O que muda são a quantidade de lojas, pessoas e uso no mês,
        e alguns recursos para redes e agências. <strong className="text-ink">Valores a definir.</strong>
      </p>
      <ul className="mt-6 grid gap-4 lg:grid-cols-3">
        {DEFAULT_PLANS.map((p) => {
          const L = p.limits;
          const limits = [
            plural(L.stores, "loja", "lojas"),
            plural(L.users, "usuário", "usuários"),
            `${gb(L.storageMb)} de armazenamento`,
            `${n(L.exportsPerMonth)} exportações por mês`,
            L.videoMinutesPerMonth ? `${plural(L.videoMinutesPerMonth, "minuto", "minutos")} de vídeo por mês` : "Sem vídeos",
            L.aiCreditsPerMonth ? `${n(L.aiCreditsPerMonth)} créditos de IA por mês` : "Sem recursos de IA",
          ];
          return (
            <li key={p.id} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{PLAN_FOR[p.id]}</p>
              <p className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-sm font-semibold">Valor a definir</p>
              <h4 className="mt-4 text-sm font-bold uppercase tracking-wide text-ink-muted">Limites</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {limits.map((l) => <li key={l} className="flex gap-2"><span aria-hidden="true" className="text-brand">•</span>{l}</li>)}
              </ul>
              <h4 className="mt-4 text-sm font-bold uppercase tracking-wide text-ink-muted">Recursos</h4>
              <ul className="mb-5 mt-2 flex-1 space-y-1 text-sm">
                {L.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>{FEATURE_LABEL[f] ?? f}</li>)}
              </ul>
              <Link href="/cadastro" className="inline-flex min-h-tap items-center justify-center rounded-xl border border-line-strong/70 px-4 font-semibold hover:bg-brand-soft">
                Criar conta
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 max-w-3xl text-sm text-ink-muted">
        Limites de referência, que podem ser ajustados até o lançamento comercial. Todos os planos geram encarte, posts, story,
        cartazes A4 e A3, etiquetas, banner da vitrine e slide de TV em imagem, com vitrine digital da loja.
      </p>
    </section>
  );
}
