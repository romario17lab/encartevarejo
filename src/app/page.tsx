import Link from "next/link";
import { btnPrimary, btnSecondary, CtaBand, MarketingShell } from "@/components/marketing/Chrome";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { PlansSection } from "@/components/marketing/PlansSection";
import { BRAND, CONTENT_PAGES, marketingMetadata, siteUrl } from "@/components/marketing/site";

// Página comercial (spec, seção 17). Sem depoimentos, clientes, números de resultado ou preços inventados.
export const metadata = marketingMetadata({
  path: "/",
  title: `${BRAND} — encartes, cartazes e posts de ofertas para o varejo`,
  description:
    "Cadastre as ofertas da semana uma vez e gere encarte A4, posts, story, cartazes A4 e A3, etiquetas, banner, slide de TV, vídeo MP4 e uma vitrine digital com QR code e lista para WhatsApp.",
  image: "encarteFeira",
  absoluteTitle: true,
});

const PIECES: Array<{ t: string; d: string }> = [
  { t: "Encarte A4", d: "Em grade, com destaque, validade e dados da loja. PDF no tamanho exato para imprimir, com sangria opcional, ou imagem." },
  { t: "Posts e story", d: "Post quadrado (1080×1080), post vertical para o feed (1080×1350) e story/status (1080×1920)." },
  { t: "Cartazes A4 e A3", d: "Um produto por página, preço grande e unidade visível, para gôndola, ponta de gôndola e vitrine." },
  { t: "Etiquetas de preço", d: "Folha A4 com até 8 etiquetas, com nome, embalagem, preço e unidade de cada oferta." },
  { t: "Banner da vitrine", d: "Faixa de 1600×600 para o topo da vitrine digital ou do site da loja." },
  { t: "Slide de TV", d: "Imagem 1920×1080 para a TV da loja, com até 8 ofertas por tela." },
  { t: "Vídeos MP4", d: "Vertical para status e reels ou horizontal para TV, de 15 a 60 segundos, com quatro estilos de animação." },
  { t: "Vitrine digital", d: "Página da loja com as ofertas válidas, busca, categorias, QR code e lista de interesse para enviar pelo WhatsApp." },
];

const STEPS: Array<{ t: string; d: string }> = [
  { t: "Cadastre a loja", d: "Logo, cores, endereço, horário, WhatsApp e redes sociais entram automaticamente no rodapé das peças." },
  { t: "Traga os produtos", d: "Digite, cole a lista que você já manda no WhatsApp ou importe uma planilha CSV/XLSX. O que não for reconhecido fica marcado para você revisar." },
  { t: "Defina as ofertas", d: "Preço simples, de/por, a partir de X unidades, leve X por, ou preço de clube — sempre com a unidade (kg, un, pct, bdj…)." },
  { t: "Escolha um modelo", d: "Modelos para supermercado, hortifrúti, açougue, padaria, bebidas, atacarejo, limpeza e datas comemorativas." },
  { t: "Revise, aprove e publique", d: "Baixe as peças em PDF, PNG ou JPEG (ou tudo em um ZIP) e publique a campanha na vitrine e na TV da loja." },
];

const TEAM: Array<{ t: string; d: string }> = [
  { t: "Aprovação", d: "A campanha passa por rascunho, revisão e aprovação antes de ser publicada. Clientes de agência aprovam por um link de prévia com validade e PIN opcional." },
  { t: "Filiais", d: "Várias lojas na mesma conta, cada uma com sua vitrine. Duplique uma campanha para outras filiais vendo antes as diferenças de preço e de endereço." },
  { t: "TV da loja", d: "Pareie a TV com um código e programe o que passa em cada horário. Oferta vencida sai da tela, mesmo se a internet cair." },
  { t: "Modo agência", d: "Cada cliente da agência tem sua própria conta, identidade visual, lojas e campanhas, administradas pela agência." },
  { t: "Calendário comercial", d: "Datas do varejo do ano para planejar campanhas com antecedência, com agendamento de início e fim." },
  { t: "Métricas simples", d: "Visitas à vitrine e cliques no WhatsApp por origem (QR code, WhatsApp, redes). Clique é interesse, não venda — e é assim que mostramos." },
];

const CHECKS = [
  "O preço “de” precisa ser maior que o “por”; desconto muito alto gera aviso para conferir.",
  "Combo só passa se sair mais barato que comprar as unidades pelo preço normal.",
  "Toda oferta exige unidade, e o mesmo preço aparece igual em todas as peças da campanha.",
  "Se você informar o custo, avisamos quando a margem fica abaixo do mínimo que você definiu. O custo nunca aparece nas peças nem na vitrine.",
  "A vitrine e a TV só mostram ofertas publicadas e dentro da validade.",
];

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl("/"),
    description: "Criação de encartes, posts, cartazes, etiquetas, vídeos e vitrine digital de ofertas para lojas de varejo.",
    inLanguage: "pt-BR",
  };
  return (
    <MarketingShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Abertura */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-6 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">Para supermercados, mercearias, hortifrútis, açougues, padarias e redes</p>
          <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.1] sm:text-5xl">
            Da lista de produtos ao encarte pronto, com o mesmo preço em todas as peças.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">
            Cadastre as ofertas da semana uma vez. O {BRAND} monta o encarte, os posts, o story, os cartazes, as etiquetas,
            o slide da TV, o vídeo e a vitrine digital da loja — no celular ou no computador.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/cadastro" className={btnPrimary}>Criar conta</Link>
            <Link href="/entrar" className={btnSecondary}>Já tenho conta</Link>
          </div>
          <p className="mt-3 text-sm text-ink-muted"><a href="#planos" className="font-semibold text-brand underline underline-offset-4">Ver planos</a> · valores a definir</p>
        </div>
        <div className="grid grid-cols-[1.4fr_1fr] items-start gap-3 sm:gap-4">
          <ExampleFigure id="encarteFeira" priority sizes="(min-width: 1024px) 330px, 56vw" />
          <ExampleFigure id="story" priority sizes="(min-width: 1024px) 230px, 38vw" className="mt-10" />
        </div>
      </section>

      {/* O que você gera */}
      <section aria-labelledby="pecas" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <h2 id="pecas" className="font-display text-2xl font-extrabold sm:text-3xl">Uma campanha, todas as peças</h2>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Os produtos, preços e a validade ficam na campanha. Cada formato é gerado a partir dela, então mudar um preço muda em todos os lugares.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIECES.map((p) => (
            <li key={p.t} className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="font-display font-bold">{p.t}</h3>
              <p className="mt-1 text-sm text-ink-muted">{p.d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Exemplos reais */}
      <section aria-labelledby="exemplos" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <h2 id="exemplos" className="font-display text-2xl font-extrabold sm:text-3xl">Exemplos gerados pelo {BRAND}</h2>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Peças geradas pelo próprio sistema a partir de uma loja fictícia, a “Mercado Exemplo”. Os preços são de demonstração.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ExampleFigure id="postQuadrado" sizes="(min-width: 1024px) 270px, 45vw" />
          <ExampleFigure id="cartazA4" sizes="(min-width: 1024px) 270px, 45vw" />
          <ExampleFigure id="etiquetas" sizes="(min-width: 1024px) 270px, 45vw" />
          <ExampleFigure id="videoQuadro" sizes="(min-width: 1024px) 270px, 45vw" />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ExampleFigure id="tv" sizes="(min-width: 1024px) 560px, 92vw" />
          <ExampleFigure id="banner" sizes="(min-width: 1024px) 560px, 92vw" />
        </div>
      </section>

      {/* Como funciona */}
      <section aria-labelledby="como" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <h2 id="como" className="font-display text-2xl font-extrabold sm:text-3xl">Como funciona</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-line bg-surface p-4">
              <span className="text-sm font-bold text-accent">Passo {i + 1}</span>
              <h3 className="mt-1 font-display font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Vitrine digital */}
      <section aria-labelledby="vitrine" className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-8 rounded-2xl border border-line bg-surface p-5 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 id="vitrine" className="font-display text-2xl font-extrabold sm:text-3xl">Vitrine digital com QR code e lista para WhatsApp</h2>
            <p className="mt-3 text-ink-muted">
              Cada loja ganha um endereço próprio com as ofertas publicadas e dentro da validade. O cliente busca, filtra por
              categoria, marca o que quer e envia a lista pelo WhatsApp da loja. Não é loja virtual: nenhum pagamento é feito ali.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>Endereço próprio da loja, que pode ir nas peças e na bio das redes</li>
              <li className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>QR code em PNG ou SVG para colar no caixa e na entrada</li>
              <li className="flex gap-2"><span aria-hidden="true" className="text-brand">✓</span>Links com origem para saber de onde vieram as visitas</li>
            </ul>
            <p className="mt-4"><Link href="/encarte-digital-whatsapp" className="font-semibold text-brand underline underline-offset-4">Encarte digital para WhatsApp: tamanhos e boas práticas</Link></p>
          </div>
          <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
            <ExampleFigure id="vitrine" sizes="(min-width: 1024px) 220px, 45vw" />
            <ExampleFigure id="vitrineLista" sizes="(min-width: 1024px) 220px, 45vw" />
          </div>
        </div>
      </section>

      {/* Equipe, filiais, agência */}
      <section aria-labelledby="redes" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <h2 id="redes" className="font-display text-2xl font-extrabold sm:text-3xl">Para redes, equipes e agências</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((s) => (
            <li key={s.t} className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="font-display font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Cuidados com o preço */}
      <section aria-labelledby="precos" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="rounded-2xl bg-highlight/35 p-5 sm:p-8">
          <h2 id="precos" className="font-display text-2xl font-extrabold sm:text-3xl">Conferências antes de imprimir</h2>
          <p className="mt-2 max-w-2xl text-ink">Erro de preço no encarte custa caro. Por isso o sistema confere o que dá para conferir:</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {CHECKS.map((c) => <li key={c} className="flex gap-2 text-sm"><span aria-hidden="true" className="font-bold text-brand-strong">✓</span>{c}</li>)}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6"><PlansSection /></div>

      {/* Guias */}
      <section aria-labelledby="guias" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <h2 id="guias" className="font-display text-2xl font-extrabold sm:text-3xl">Guias práticos</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENT_PAGES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 hover:border-brand hover:bg-brand-soft/40">
                <span className="font-display font-bold text-brand">{p.label}</span>
                <span className="mt-1 text-sm text-ink-muted">{p.teaser}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <CtaBand title="Comece pela campanha desta semana" />
      </div>
    </MarketingShell>
  );
}
