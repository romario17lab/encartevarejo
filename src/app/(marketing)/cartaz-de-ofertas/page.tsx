import Link from "next/link";
import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/cartaz-de-ofertas";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Cartaz de ofertas A4 e A3: legível de longe e com o preço certo",
  description:
    "Como fazer cartaz de ofertas A4 e A3 para a loja: hierarquia do preço, centavos e unidade, de/por, preço por quilo, leve X por, preço de clube e conferência com a etiqueta e o caixa.",
  image: "cartazA4",
});

const MECHANICS: Array<[string, string, string]> = [
  ["De/por", "De R$ 6,99 por R$ 4,99 o kg", "O “de” é o preço que estava sendo cobrado. Ele aparece menor e riscado; o “por” é o maior elemento do cartaz."],
  ["Preço por quilo", "R$ 42,90 / kg", "Para pesáveis, a unidade “kg” fica colada ao preço, nunca solta em outro canto."],
  ["Por unidade ou embalagem", "R$ 4,59 / un · R$ 18,90 / bdj", "Diga o que é a unidade: caixa, pacote, bandeja, fardo, garrafa."],
  ["A partir de X", "A partir de 6 un: R$ 2,49 cada", "Mostre a quantidade mínima com o mesmo destaque do preço e, se possível, o preço normal."],
  ["Leve X por", "Leve 3 por R$ 12,00", "Ajuda informar quanto sai cada unidade e o preço avulso, para o cliente comparar."],
  ["Preço de clube", "Clube: R$ 42,90 / kg · Normal R$ 49,99 / kg", "Os dois preços aparecem, e fica claro quem tem direito ao menor."],
];

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Cartaz de ofertas"
      title="Cartaz de ofertas A4 e A3: como fazer um cartaz que se lê de longe"
      lead={<p>O cartaz é lido em movimento, de longe e de relance. Ele precisa responder em um segundo a três perguntas: que produto é, quanto custa e em que unidade. O resto é apoio.</p>}
      related={["/encarte-para-supermercado", "/criar-encarte-online", "/gerador-de-encartes"]}
      cta={{ title: "Gere cartazes e etiquetas da campanha", text: `No ${BRAND}, cada oferta vira um cartaz A4 ou A3 e uma etiqueta, com o mesmo preço do encarte.` }}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr]">
        <Prose>
          <h2>A4 ou A3?</h2>
          <p>
            O A4 (210 × 297 mm) cabe em suportes de gôndola, balcões e ilhas, e sai em qualquer impressora. O A3 (297 × 420 mm)
            tem o dobro da área e serve para vitrine, entrada, ponta de gôndola e pontos vistos de mais longe. Em ambos, use
            um produto por cartaz: dois produtos dividem a atenção e o preço fica menor.
          </p>

          <h2>A hierarquia certa</h2>
          <ol>
            <li><strong>Preço</strong>: o maior elemento. Os reais grandes; os centavos menores, mas ainda legíveis.</li>
            <li><strong>Nome do produto</strong>: curto, em letras grossas, com a embalagem logo abaixo.</li>
            <li><strong>Unidade</strong>: junto do preço (kg, un, pct), no mesmo bloco visual.</li>
            <li><strong>Condições e validade</strong>: menores, mas presentes.</li>
          </ol>
          <p>
            Contraste alto (texto escuro sobre fundo claro ou o contrário) e pouca informação valem mais que muitos efeitos.
            Um teste simples: imprima um cartaz e olhe da distância de onde o cliente vai vê-lo. Se o preço não se lê na hora,
            aumente o preço e corte texto.
          </p>
        </Prose>
        <div className="flex flex-col gap-6 lg:row-span-2 lg:sticky lg:top-6 lg:self-start">
          <ExampleFigure id="cartazA4" sizes="(min-width: 1024px) 300px, 92vw" caption="De/por com o preço como maior elemento." />
          <ExampleFigure id="cartazA3" sizes="(min-width: 1024px) 300px, 92vw" caption="Preço de clube com o preço normal informado." />
        </div>
        <div className="lg:col-start-1">
          <h2 className="font-display text-2xl font-extrabold leading-tight">Como escrever cada mecânica de preço</h2>
          <ul className="mt-4 grid max-w-3xl gap-3">
            {MECHANICS.map(([t, ex, d]) => (
              <li key={t} className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="font-display font-bold">{t}</h3>
                <p className="ev-num mt-1 inline-block rounded-md bg-highlight/60 px-2 py-0.5 text-sm font-bold">{ex}</p>
                <p className="mt-2 text-sm text-ink-muted">{d}</p>
              </li>
            ))}
          </ul>
          <Prose className="mt-12">
            <h2>Cartaz, etiqueta e caixa precisam concordar</h2>
            <p>
              O cliente compara o cartaz com a etiqueta da prateleira e com o cupom do caixa. Se um deles estiver diferente,
              a confiança vai embora — e o Código de Defesa do Consumidor exige informação de preço clara e correta. Antes de
              colar os cartazes, confira se o preço já foi atualizado no sistema do caixa para o mesmo período. Este guia não é
              orientação jurídica.
            </p>
            <h2>Etiquetas na mesma tirada</h2>
            <p>
              Aproveite a lista do cartaz para imprimir as etiquetas da prateleira na mesma hora, com o mesmo preço e a mesma
              unidade. Assim a troca de preço da semana vira uma tarefa só. Para a parte do encarte, veja <Link href="/encarte-para-supermercado">encarte para supermercado</Link>.
            </p>
          </Prose>
          <div className="mt-6 max-w-sm">
            <ExampleFigure id="etiquetas" sizes="(min-width: 640px) 384px, 92vw" caption="Oito etiquetas por folha A4." />
          </div>
        </div>
      </div>

      <HowWeDoIt>
        <ul>
          <li>Cartaz A4 e A3 com um produto por página, em PDF no tamanho exato da folha (com sangria de 3 mm quando você pede) ou em imagem.</li>
          <li>As cinco mecânicas — simples, de/por, a partir de X, leve X por e clube — têm desenho próprio no cartaz, com a unidade sempre junto do preço.</li>
          <li>O sistema não aceita de/por com o “de” menor que o “por”, nem preço de clube maior que o normal, e avisa quando o desconto parece alto demais.</li>
          <li>Etiquetas em folha A4 (até 8 por folha) saem da mesma campanha, com o mesmo preço do cartaz e do encarte.</li>
        </ul>
      </HowWeDoIt>
    </Article>
  );
}
