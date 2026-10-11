import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/gerador-de-encartes";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Gerador de encartes: uma lista de ofertas, todas as peças",
  description:
    "O que um gerador de encartes faz por você: diagramação automática, um preço igual em todos os formatos e peças para impresso, redes sociais, loja e TV.",
  image: "tv",
});

const FORMATS: Array<[string, string, string, string]> = [
  ["Encarte A4", "210 × 297 mm", "Impresso, distribuição e PDF digital", "PDF, PNG, JPEG"],
  ["Post quadrado", "1080 × 1080 px", "Feed das redes sociais, grupos", "PNG, JPEG"],
  ["Post vertical", "1080 × 1350 px", "Feed (ocupa mais tela no celular)", "PNG, JPEG"],
  ["Story e status", "1080 × 1920 px", "Status do WhatsApp, stories", "PNG, JPEG"],
  ["Cartaz A4", "210 × 297 mm", "Gôndola, ilha, balcão", "PDF, PNG, JPEG"],
  ["Cartaz A3", "297 × 420 mm", "Vitrine, entrada, ponta de gôndola", "PDF, PNG, JPEG"],
  ["Etiquetas", "Folha A4, até 8 por folha", "Preço na prateleira", "PDF, PNG"],
  ["Banner da vitrine", "1600 × 600 px", "Topo da vitrine digital ou do site", "PNG, JPEG"],
  ["Slide de TV", "1920 × 1080 px", "TV da loja", "PNG, JPEG"],
  ["Vídeo", "1080 × 1920 ou 1920 × 1080", "Status, reels, TV — 15 a 60 s", "MP4"],
];

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Gerador de encartes"
      title="Gerador de encartes: o que ele automatiza e o que continua com você"
      lead={<p>Um gerador de encartes não substitui a decisão de quais produtos anunciar e por quanto. Ele tira de você o trabalho repetitivo: encaixar produtos, ajustar textos, refazer a mesma arte em vários tamanhos e conferir se o preço ficou igual em todos.</p>}
      related={["/criar-encarte-online", "/encarte-digital-whatsapp", "/marketing-para-lojas-de-varejo"]}
      cta={{ title: "Gere todas as peças da campanha", text: `No ${BRAND}, cada formato sai da mesma campanha. Mudou um preço? Ele muda em todas as peças.` }}
    >
      <Prose>
        <h2>Editor de imagem ou gerador: qual é a diferença</h2>
        <p>
          Em um editor de imagem comum, cada peça é um arquivo independente. Se o preço do contrafilé mudar, alguém precisa
          lembrar de abrir o encarte, o post, o story, o cartaz e a etiqueta e corrigir um por um. É nesse caminho que aparecem
          os preços diferentes entre o folheto e a gôndola.
        </p>
        <p>
          Em um gerador, a fonte da verdade é a lista de ofertas. As peças são desenhadas a partir dela por modelos que já
          sabem onde vai o nome, a embalagem, o preço, os centavos e a unidade. Você muda o dado; o desenho acompanha.
        </p>

        <h2>O que precisa ser automático</h2>
        <ul>
          <li><strong>Encaixe dos produtos</strong>: com 1 ou com 40 ofertas, o modelo distribui o espaço sem cortar o preço.</li>
          <li><strong>Nomes longos</strong>: o texto quebra e reduz dentro de limites, em vez de sair da caixa.</li>
          <li><strong>Produtos sem foto</strong>: o card continua equilibrado, sem buraco no lugar da imagem.</li>
          <li><strong>Área de segurança</strong>: nada importante perto da borda de corte, nem atrás dos botões do story.</li>
          <li><strong>Dados da loja</strong>: endereço, horário, telefone e redes no rodapé, sempre atualizados.</li>
        </ul>

        <h2>O que continua sendo decisão sua</h2>
        <ul>
          <li>Quais produtos entram e quais vão em destaque.</li>
          <li>O preço, a mecânica da oferta e o período de validade.</li>
          <li>O modelo visual que combina com a loja e com a época do ano.</li>
          <li>A revisão final antes de imprimir e publicar.</li>
        </ul>
      </Prose>

      <section aria-labelledby="formatos" className="mt-12">
        <h2 id="formatos" className="font-display text-2xl font-extrabold">Formatos gerados a partir de uma campanha</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Formatos, medidas, uso indicado e tipos de arquivo</caption>
            <thead className="bg-surface-alt">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Peça</th>
                <th scope="col" className="px-4 py-3 font-semibold">Medida</th>
                <th scope="col" className="px-4 py-3 font-semibold">Onde usar</th>
                <th scope="col" className="px-4 py-3 font-semibold">Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {FORMATS.map(([p, m, u, f]) => (
                <tr key={p} className="border-t border-line">
                  <th scope="row" className="px-4 py-3 font-semibold">{p}</th>
                  <td className="ev-num px-4 py-3">{m}</td>
                  <td className="px-4 py-3 text-ink-muted">{u}</td>
                  <td className="px-4 py-3">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <ExampleFigure id="postFeed" sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw" />
        <ExampleFigure id="tv" sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw" />
        <ExampleFigure id="banner" sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw" />
      </div>

      <HowWeDoIt>
        <ul>
          <li>Os modelos cobrem supermercado, hortifrúti, açougue, padaria, bebidas, atacarejo, limpeza, empório e datas comemorativas. As cores podem seguir a paleta do modelo ou a identidade da sua loja.</li>
          <li>As peças do mesmo pedido saem juntas em um arquivo ZIP, separadas em pastas por destino: encarte, redes sociais, cartazes, etiquetas, vitrine e TV.</li>
          <li>Os vídeos MP4 usam as mesmas ofertas, em quatro estilos de animação, com a opção de trilha gerada pelo sistema ou áudio próprio (com confirmação de que você tem a licença).</li>
          <li>Quando um modelo é atualizado, campanhas antigas continuam com a versão em que foram feitas, para uma reimpressão sair igual à original.</li>
        </ul>
      </HowWeDoIt>
    </Article>
  );
}
