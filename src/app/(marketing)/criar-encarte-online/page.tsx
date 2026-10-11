import Link from "next/link";
import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/criar-encarte-online";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Criar encarte online: passo a passo do encarte da semana",
  description:
    "Como criar um encarte online do início ao fim: fechar a lista e os preços, montar as ofertas, revisar com outra pessoa e gerar o PDF certo para a gráfica.",
  image: "encarteFeira",
});

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Criar encarte online"
      title="Como criar um encarte online, do fechamento da lista ao PDF da gráfica"
      lead={<p>O encarte da semana é uma rotina: os preços mudam, o prazo é curto e um erro vai impresso para a rua. Este guia organiza o trabalho em etapas e mostra o que conferir em cada uma.</p>}
      related={["/encarte-para-supermercado", "/gerador-de-encartes", "/cartaz-de-ofertas"]}
      cta={{ title: "Crie o encarte desta semana", text: `Com o ${BRAND}, você cadastra as ofertas uma vez e baixa o encarte em PDF para a gráfica, além das outras peças da campanha.` }}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Prose>
          <h2>1. Feche a lista antes de abrir qualquer editor</h2>
          <p>
            A maior parte do retrabalho em encarte vem de lista que muda depois da arte pronta. Antes de começar, combine com
            compras ou com quem negocia com os fornecedores:
          </p>
          <ul>
            <li><strong>O período da oferta</strong>: data de início e de fim, e se vale para todas as lojas.</li>
            <li><strong>A lista final de produtos</strong>, com o preço de oferta e, quando houver, o preço anterior.</li>
            <li><strong>O prazo da gráfica</strong>: conte de trás para frente a partir do dia da distribuição.</li>
            <li><strong>Quem aprova</strong>: uma pessoa diferente de quem montou, sempre que possível.</li>
          </ul>

          <h2>2. Escreva cada produto como o cliente procura</h2>
          <p>
            No encarte, o nome do produto precisa ser reconhecido de relance. Prefira o nome comum seguido da embalagem:
            “Arroz branco tipo 1 — pacote 5 kg” diz mais que um código interno ou uma abreviação do sistema da loja.
          </p>
          <ul>
            <li>Informe o <strong>tamanho ou peso da embalagem</strong> (1 L, 500 g, bandeja com 30).</li>
            <li>Defina a <strong>unidade do preço</strong>: por quilo, por unidade, por pacote, por bandeja, por dúzia.</li>
            <li>Evite abreviações que só a equipe entende.</li>
          </ul>

          <h2>3. Escolha a mecânica de cada oferta</h2>
          <p>Nem toda oferta é só um preço. As mais comuns no varejo alimentar:</p>
          <ul>
            <li><strong>Preço simples</strong>: R$ 4,99 o quilo.</li>
            <li><strong>De/por</strong>: de R$ 6,99 por R$ 4,99. Só use se o preço “de” for o que estava realmente sendo praticado.</li>
            <li><strong>A partir de X unidades</strong>: R$ 2,49 cada, levando 6 ou mais.</li>
            <li><strong>Leve X por</strong>: leve 3 por R$ 12,00.</li>
            <li><strong>Preço de clube</strong>: preço normal e preço para quem participa do programa da loja.</li>
          </ul>
          <p>
            Para escrever cada uma de forma clara no papel, veja o guia de <Link href="/cartaz-de-ofertas">cartaz de ofertas</Link>,
            que trata de de/por, unidade e preço por quilo.
          </p>

          <h2>4. Monte, revise e só depois exporte</h2>
          <p>Na revisão, quem confere deve ter a lista de preços ao lado e checar, item por item:</p>
          <ol>
            <li>Preço, centavos e unidade de cada produto.</li>
            <li>Preço “de” maior que o “por”, e combos mais baratos que as unidades avulsas.</li>
            <li>Datas de validade e o texto “ou enquanto durarem os estoques”, se a loja usa.</li>
            <li>Endereço, telefone, WhatsApp e horário da loja.</li>
            <li>Limites por cliente e condições de pagamento, quando existirem.</li>
          </ol>

          <h2>5. Gere o arquivo certo para cada destino</h2>
          <p>
            Para a gráfica, o arquivo costuma ser um PDF no tamanho final da folha. Pergunte à gráfica se ela pede sangria (uma
            margem extra de imagem além do corte) e qual resolução espera. Para o WhatsApp e as redes, uma imagem é melhor que
            PDF, porque aparece direto na conversa — veja o guia de <Link href="/encarte-digital-whatsapp">encarte digital para WhatsApp</Link>.
          </p>
        </Prose>
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <ExampleFigure id="encarteFeira" sizes="(min-width: 1024px) 300px, 92vw" caption="Mesma lista de produtos…" />
          <ExampleFigure id="encarteEconomia" sizes="(min-width: 1024px) 300px, 92vw" caption="…em outro modelo, sem redigitar nada." />
        </div>
      </div>

      <HowWeDoIt>
        <ul>
          <li>Os produtos podem ser digitados, colados como texto (a mesma lista que circula no WhatsApp da equipe) ou importados de planilha CSV/XLSX. O que o sistema não reconhece fica marcado para você completar — ele não inventa preço.</li>
          <li>Cada oferta tem a mecânica certa: simples, de/por, a partir de X unidades, leve X por e preço de clube, sempre com unidade.</li>
          <li>Antes de exportar, o sistema avisa sobre preço “de” menor que o “por”, desconto alto demais, combo mais caro que as unidades e item sem preço ou sem unidade.</li>
          <li>A campanha passa por rascunho, revisão e aprovação. Quem aprova vê exatamente a versão que será publicada.</li>
          <li>O encarte A4 sai em PDF no tamanho exato da folha (com sangria de 3 mm quando você pede) ou em PNG/JPEG. Se a lista não cabe com legibilidade em uma página, as ofertas vão para as páginas seguintes.</li>
        </ul>
      </HowWeDoIt>
    </Article>
  );
}
