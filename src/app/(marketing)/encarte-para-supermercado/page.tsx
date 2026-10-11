import Link from "next/link";
import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/encarte-para-supermercado";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Encarte para supermercado: seções, destaques e textos obrigatórios",
  description:
    "Como organizar o encarte de supermercado: dividir por seções, escolher os destaques, tratar pesáveis por quilo e escrever validade, limites e condições sem ambiguidade.",
  image: "postQuadrado",
});

const SECTIONS: Array<[string, string]> = [
  ["Hortifrúti", "Preço quase sempre por quilo; frutas e verduras da estação costumam render boas fotos de destaque."],
  ["Açougue", "Indique o corte e a forma de venda (peça, bife, bandeja). Preço por quilo bem visível."],
  ["Frios e laticínios", "Fatiados por quilo ou bandeja; leite e iogurte por unidade ou caixa. Deixe claro qual é qual."],
  ["Padaria", "Pão francês por quilo, bolos e salgados por unidade."],
  ["Mercearia", "Arroz, feijão, óleo, café, açúcar: informe sempre a embalagem (5 kg, 1 kg, 900 ml)."],
  ["Bebidas", "Diferencie lata, garrafa, fardo e caixa — o preço por fardo engana se a unidade não aparece."],
  ["Limpeza e higiene", "Embalagem e quantidade (1 L, pacote com 12 rolos) fazem toda a diferença na comparação."],
];

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Encarte para supermercado"
      title="Encarte para supermercado: como organizar seções, destaques e textos"
      lead={<p>Um bom encarte de supermercado se lê como um corredor bem arrumado: o cliente acha rápido a seção que procura, vê primeiro as ofertas mais fortes e entende sem dúvida quanto vai pagar e até quando.</p>}
      related={["/criar-encarte-online", "/cartaz-de-ofertas", "/marketing-para-lojas-de-varejo"]}
      cta={{ title: "Monte o encarte do seu supermercado", text: `O ${BRAND} organiza as ofertas por categoria e destaca os itens que você marcar, com o rodapé da loja preenchido.` }}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Prose>
          <h2>Comece pelos destaques</h2>
          <p>
            Os destaques são as ofertas que mais chamam a família para a loja naquela semana. Costumam ser itens de compra
            frequente com preço competitivo — carne, hortifrúti da estação, arroz, café, óleo. Coloque poucos, para que o
            destaque continue sendo destaque: um encarte com tudo em tamanho grande não tem destaque nenhum.
          </p>

          <h2>Divida por seções, na ordem da compra</h2>
          <p>
            Agrupar por seção ajuda o cliente a montar a lista mentalmente. Uma ordem que funciona é a do próprio passeio pela
            loja, ou a do peso no orçamento. Cuidados por seção:
          </p>
          <ul>
            {SECTIONS.map(([t, d]) => <li key={t}><strong>{t}</strong>: {d}</li>)}
          </ul>

          <h2>Use dias temáticos com clareza</h2>
          <p>
            Ofertas de dia certo (o “dia da feira” do hortifrúti, o dia da carne) só funcionam se a data estiver escrita no
            próprio material. Em peça separada para cada dia, o título já diz o dia; dentro do encarte da semana, deixe a
            restrição junto da oferta, não apenas no rodapé.
          </p>

          <h2>Textos que não podem faltar</h2>
          <ul>
            <li><strong>Validade</strong>: datas de início e fim, por extenso ou em dd/mm.</li>
            <li><strong>Estoque</strong>: “ou enquanto durarem os estoques”, se a loja trabalha assim.</li>
            <li><strong>Limite por cliente</strong>, junto da oferta a que se refere.</li>
            <li><strong>Condições</strong>: preço só no Pix, só para o clube, só a partir de X unidades.</li>
            <li><strong>Lojas participantes</strong>, quando a rede tem filiais com preços diferentes.</li>
            <li><strong>Imagens ilustrativas</strong>, quando a foto não é do produto exato.</li>
          </ul>
          <p>
            O Código de Defesa do Consumidor pede informação clara e correta sobre preço e condições. Este guia não é
            orientação jurídica; em caso de dúvida, consulte o Procon da sua cidade ou um advogado.
          </p>

          <h2>Pesáveis: quilo e unidade sem confusão</h2>
          <p>
            Para itens vendidos a granel ou fatiados no balcão, anuncie o preço por quilo e escreva “kg” colado ao preço. Se a
            oferta for por bandeja ou peça, diga o peso aproximado ou a quantidade (bandeja com 30 ovos). Para ver como isso
            fica no papel, leia o guia de <Link href="/cartaz-de-ofertas">cartaz de ofertas</Link>.
          </p>
        </Prose>
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <ExampleFigure id="postQuadrado" sizes="(min-width: 1024px) 320px, 92vw" caption="Dia temático do hortifrúti, com preço por quilo." />
          <ExampleFigure id="encarteEconomia" sizes="(min-width: 1024px) 320px, 92vw" caption="Destaque grande e grade para o restante." />
        </div>
      </div>

      <HowWeDoIt>
        <ul>
          <li>Cada produto tem categoria; a vitrine digital agrupa as ofertas por ela e o cliente filtra por seção.</li>
          <li>Você marca quais ofertas são destaque, e o modelo dá a elas mais espaço.</li>
          <li>A validade da campanha vai em todas as peças; limite por cliente, condição de pagamento e observações são campos de cada oferta, impressos junto do preço.</li>
          <li>O rodapé traz endereço, horário, telefone, WhatsApp e redes da loja, além do texto legal que você definir uma vez no kit da marca.</li>
          <li>Redes com filiais duplicam a campanha para outras lojas e veem antes o que muda: preços, itens sem preço, endereço e contatos.</li>
        </ul>
      </HowWeDoIt>
    </Article>
  );
}
