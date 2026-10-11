import Link from "next/link";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "EncarteVarejo";

// Página inicial provisória (a landing de marketing vem depois). Sem números ou depoimentos inventados.
export default function Home() {
  const steps = [
    { t: "Cadastre seus produtos", d: "Digite, cole uma lista ou importe uma planilha CSV/XLSX." },
    { t: "Escolha um modelo", d: "Modelos para supermercado, hortifrúti, açougue, padaria e bebidas." },
    { t: "Gere todas as peças", d: "Encarte A4, posts, story, cartazes, etiquetas, banner e TV com os mesmos preços." },
  ];
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-extrabold text-brand">{BRAND}</span>
        <Link href="/entrar" className="rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">Entrar</Link>
      </header>
      <section className="flex flex-1 flex-col justify-center gap-6 py-10">
        <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">
          Da lista de produtos ao encarte pronto, com o preço certo em todas as peças.
        </h1>
        <p className="text-lg text-ink-muted">
          Monte a campanha da semana uma vez e gere encarte, posts, story, cartazes e etiquetas — no celular ou no computador.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/cadastro" className="inline-flex h-13 items-center justify-center rounded-xl bg-brand px-6 py-3 text-base font-semibold text-white hover:bg-brand-strong">
            Criar conta grátis
          </Link>
          <Link href="/entrar" className="inline-flex h-13 items-center justify-center rounded-xl border border-line bg-surface px-6 py-3 text-base font-semibold hover:bg-surface-alt">
            Já tenho conta
          </Link>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-line bg-surface p-4">
              <span className="text-sm font-bold text-accent">Passo {i + 1}</span>
              <h2 className="mt-1 font-display font-bold">{s.t}</h2>
              <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
