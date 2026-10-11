import Link from "next/link";
import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/marketing-para-lojas-de-varejo";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Marketing para lojas de varejo: uma rotina semanal de ofertas",
  description:
    "Marketing de ofertas para loja de bairro, supermercado e rede: rotina semanal, calendário comercial, canais dentro e fora da loja, identidade visual e o que dá para medir com honestidade.",
  image: "banner",
});

const WEEK: Array<[string, string]> = [
  ["Planejar", "Defina o tema e o período da próxima campanha, olhando o calendário e o que compras conseguiu negociar."],
  ["Fechar a lista", "Produtos, preços, mecânicas e limites. Daqui em diante, mudança só com aviso a todos."],
  ["Produzir", "Encarte, posts, story, cartazes, etiquetas, slide da TV e vídeo, todos a partir da mesma lista."],
  ["Aprovar", "Alguém que não montou confere preço, unidade, validade e dados da loja."],
  ["Publicar e distribuir", "Gráfica, redes, WhatsApp, vitrine digital, TV e troca de cartazes e etiquetas na loja."],
  ["Encerrar e olhar os números", "Retire o material vencido e anote o que funcionou para a próxima."],
];

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Marketing para lojas de varejo"
      title="Marketing para lojas de varejo: uma rotina semanal que cabe no seu dia"
      lead={<p>Para a maioria das lojas de bairro, supermercados e pequenas redes, o marketing que mais pesa é o de ofertas: escolher bem, comunicar com clareza e repetir toda semana sem erro. Não precisa de agência grande — precisa de rotina.</p>}
      related={["/encarte-digital-whatsapp", "/encarte-para-supermercado", "/gerador-de-encartes"]}
      cta={{ title: "Organize a rotina de ofertas da loja", text: `O ${BRAND} junta calendário, campanha, aprovação, peças, vitrine e TV no mesmo lugar.` }}
    >
      <section aria-labelledby="rotina">
        <h2 id="rotina" className="font-display text-2xl font-extrabold">A rotina em seis etapas</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WEEK.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-4">
              <span className="text-sm font-bold text-accent">Etapa {i + 1}</span>
              <h3 className="mt-1 font-display font-bold">{t}</h3>
              <p className="mt-1 text-sm text-ink-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Prose>
          <h2>Planeje pelo calendário, não pela urgência</h2>
          <p>
            Datas como Páscoa, Dia das Mães, festas juninas, Dia dos Pais, Black Friday e Natal mudam o que o cliente procura.
            Olhar o calendário com algumas semanas de antecedência dá tempo de negociar com fornecedores e preparar um visual
            próprio para a data, em vez de improvisar na véspera. Entre as datas, as campanhas fixas da semana (como o dia do
            hortifrúti) criam hábito.
          </p>

          <h2>Esteja nos canais em que o cliente já está</h2>
          <ul>
            <li><strong>Na loja</strong>: cartazes, etiquetas e a TV mostram a oferta na hora da decisão.</li>
            <li><strong>No bairro</strong>: o encarte impresso ainda é visto por muita gente que não segue a loja nas redes.</li>
            <li><strong>No celular</strong>: status e grupos de WhatsApp, posts e stories, e uma vitrine com todas as ofertas.</li>
          </ul>
          <p>
            Mais importante que estar em todos os canais é o preço ser o mesmo em todos eles. Veja como adaptar as peças em
            <Link href="/encarte-digital-whatsapp"> encarte digital para WhatsApp</Link>.
          </p>

          <h2>Uma identidade, muitas peças</h2>
          <p>
            Logo, cores e o jeito de escrever o preço repetidos semana após semana fazem o cliente reconhecer a loja antes de
            ler o nome. Defina uma vez o kit da marca e use-o em todas as peças; varie o tema, não a identidade.
          </p>

          <h2>Meça o que dá para medir</h2>
          <p>
            Visitas à vitrine digital e cliques para o WhatsApp mostram interesse, e saber se vieram do QR code, do status ou
            das redes ajuda a decidir onde investir tempo. Mas clique não é venda: para saber se a campanha vendeu, compare
            as vendas dos itens anunciados no seu sistema de caixa com períodos parecidos sem oferta.
          </p>

          <h2>Redes e agências: aprovação e consistência</h2>
          <p>
            Quando são várias lojas ou vários clientes, o risco é cada um fazer de um jeito. Uma campanha central, duplicada
            para as filiais com os ajustes de preço de cada uma, e um fluxo de aprovação claro evitam que o material errado
            chegue à rua.
          </p>
        </Prose>
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <ExampleFigure id="tv" sizes="(min-width: 1024px) 400px, 92vw" caption="Slide para a TV da loja." />
          <ExampleFigure id="banner" sizes="(min-width: 1024px) 400px, 92vw" caption="Banner para o topo da vitrine digital." />
        </div>
      </div>

      <HowWeDoIt>
        <ul>
          <li>Calendário comercial com as datas do varejo, e campanhas com início e fim agendados.</li>
          <li>Kit da marca com logo, cores e texto legal, aplicado em todas as peças e na vitrine.</li>
          <li>Fluxo de rascunho, revisão, aprovação e publicação; no plano para redes e agências, aprovação em várias etapas e link de prévia para o cliente aprovar.</li>
          <li>TV da loja pareada por código, com programação por horário e retirada automática de oferta vencida.</li>
          <li>Métricas de visitas à vitrine e cliques no WhatsApp por origem, apresentadas como interesse — não como vendas.</li>
          <li>Modo agência: cada cliente com conta, identidade, lojas e campanhas próprias.</li>
        </ul>
      </HowWeDoIt>
    </Article>
  );
}
