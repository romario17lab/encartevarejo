import Link from "next/link";
import { Article, HowWeDoIt, Prose } from "@/components/marketing/Article";
import { ExampleFigure } from "@/components/marketing/ExampleFigure";
import { BRAND, marketingMetadata } from "@/components/marketing/site";

const PATH = "/encarte-digital-whatsapp";

export const metadata = marketingMetadata({
  path: PATH,
  title: "Encarte digital para WhatsApp: tamanhos, status e link da vitrine",
  description:
    "Como divulgar ofertas no WhatsApp: tamanho certo para status e conversas, imagem ou PDF, quantos produtos por imagem, vídeo vertical e o link da vitrine com lista de interesse.",
  image: "story",
});

const SIZES: Array<[string, string, string]> = [
  ["Status do WhatsApp e stories", "1080 × 1920 px (9:16)", "Ocupa a tela inteira do celular. Poucos produtos, preço grande."],
  ["Conversas e grupos", "1080 × 1350 px (4:5) ou 1080 × 1080 px (1:1)", "Aparece inteiro na conversa sem precisar abrir. O 4:5 aproveita mais a tela."],
  ["Encarte completo", "A4 em imagem ou PDF", "Bom para quem quer ver tudo; no celular, exige zoom. Mande junto das imagens menores, não no lugar delas."],
  ["Vídeo", "1080 × 1920 px, 15 a 60 s", "Movimento chama atenção no status. Curto e com o preço visível em cada cena."],
];

export default function Page() {
  return (
    <Article
      path={PATH}
      label="Encarte digital para WhatsApp"
      title="Encarte digital para WhatsApp: tamanhos, formatos e o link da vitrine"
      lead={<p>No WhatsApp, o encarte é visto numa tela pequena, entre outras mensagens, muitas vezes por poucos segundos. O que funciona no papel precisa ser adaptado: menos produtos por imagem, preço maior e um link para quem quiser ver tudo.</p>}
      related={["/gerador-de-encartes", "/marketing-para-lojas-de-varejo", "/criar-encarte-online"]}
      cta={{ title: "Divulgue as ofertas no WhatsApp", text: `O ${BRAND} gera story, posts e vídeo da campanha e mantém a vitrine da loja atualizada para você mandar o link.` }}
    >
      <section aria-labelledby="tamanhos">
        <h2 id="tamanhos" className="font-display text-2xl font-extrabold">Tamanho certo para cada lugar</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {SIZES.map(([t, s, d]) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="font-display font-bold">{t}</h3>
              <p className="ev-num mt-1 text-sm font-semibold text-brand-strong">{s}</p>
              <p className="mt-1 text-sm text-ink-muted">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Prose>
          <h2>Imagem ou PDF?</h2>
          <p>
            Imagem aparece direto na conversa e no status; PDF precisa ser baixado e aberto. Para a divulgação do dia a dia, use
            imagens. O PDF do encarte completo é útil para quem pede “manda o folheto”, mas não deve ser a única peça.
          </p>

          <h2>Quantos produtos por imagem</h2>
          <p>
            Na tela do celular, cada produto a mais deixa o preço menor. Em vez de uma imagem com o encarte inteiro, divida as
            ofertas em várias imagens com poucos produtos cada — por seção (açougue, hortifrúti, mercearia) ou por destaque.
            O aplicativo costuma comprimir as fotos enviadas; letras finas e preços pequenos sofrem primeiro.
          </p>

          <h2>Status, lista de transmissão e grupos</h2>
          <ul>
            <li><strong>Status</strong>: aparece para os contatos da loja, conforme a privacidade do status. Bom para as ofertas do dia.</li>
            <li><strong>Lista de transmissão</strong>: a mensagem chega individualmente, mas só para quem salvou o número da loja.</li>
            <li><strong>Grupos</strong>: combine a frequência com os participantes e evite encher o grupo de imagens.</li>
          </ul>
          <p>
            Mande ofertas apenas para quem pediu para receber, e ofereça um jeito fácil de sair da lista. Além de ser o
            correto, isso evita denúncias e bloqueios do número.
          </p>

          <h2>O link da vitrine resolve o “manda tudo”</h2>
          <p>
            Uma página com todas as ofertas válidas — que o cliente abre no navegador, sem instalar nada — evita mandar
            dezenas de imagens. Coloque o link na mensagem, na descrição do perfil e no QR code do caixa. Se a página deixar o
            cliente marcar os produtos e mandar a lista de volta pelo WhatsApp, a loja recebe o pedido organizado para separar
            ou confirmar.
          </p>
        </Prose>
        <div className="grid grid-cols-2 gap-4 lg:sticky lg:top-6 lg:self-start">
          <ExampleFigure id="story" sizes="(min-width: 1024px) 200px, 45vw" />
          <ExampleFigure id="videoQuadro" sizes="(min-width: 1024px) 200px, 45vw" />
          <ExampleFigure id="vitrine" sizes="(min-width: 1024px) 200px, 45vw" />
          <ExampleFigure id="vitrineLista" sizes="(min-width: 1024px) 200px, 45vw" />
        </div>
      </div>

      <HowWeDoIt>
        <ul>
          <li>Story/status (1080×1920), post vertical (1080×1350) e post quadrado (1080×1080) saem da mesma campanha. Se as ofertas não cabem com legibilidade em uma imagem, elas são divididas em várias, numeradas (1/2, 2/2).</li>
          <li>Vídeo MP4 vertical ou horizontal, de 15 a 60 segundos, com os mesmos preços.</li>
          <li>Cada loja tem uma vitrine digital com as ofertas publicadas e dentro da validade, busca e categorias. Oferta vencida sai sozinha.</li>
          <li>O cliente marca os produtos, ajusta as quantidades e envia a lista para o WhatsApp da loja. A página deixa claro que é só uma mensagem: não é compra e não há pagamento.</li>
          <li>QR code da vitrine em PNG ou SVG e links com origem (WhatsApp, QR code, redes) para você ver de onde vêm as visitas e os cliques no WhatsApp.</li>
        </ul>
        <p>Veja também como organizar a rotina de divulgação em <Link href="/marketing-para-lojas-de-varejo">marketing para lojas de varejo</Link>.</p>
      </HowWeDoIt>
    </Article>
  );
}
