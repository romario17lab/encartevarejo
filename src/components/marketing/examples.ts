// Exemplos reais gerados pelo próprio renderizador (PieceRenderer + modelos v3) com DADOS DE DEMONSTRAÇÃO
// (loja "Mercado Exemplo", preços fictícios). Arquivos otimizados em public/exemplos/ (WebP).
// As duas imagens da vitrine são capturas da vitrine pública de demonstração (/loja/<slug> da conta demo do seed).

export interface Example {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** o que é a peça (legenda) */
  label: string;
}

const ex = (file: string, width: number, height: number, label: string, alt: string): Example => ({ src: `/exemplos/${file}.webp`, width, height, label, alt });

export const EXAMPLES = {
  encarteFeira: ex("encarte-a4-feira-da-semana", 620, 877, "Encarte A4 — modelo Feira da Semana",
    "Encarte A4 vermelho e amarelo com o título Ofertas da semana, tomate italiano em destaque por R$ 4,99 o quilo e outros onze produtos com preços, unidades e validade no rodapé"),
  encarteEconomia: ex("encarte-a4-economia-total", 620, 877, "Encarte A4 — modelo Economia Total",
    "Encarte A4 amarelo com produtos em grade, selos de desconto, preços grandes com unidade e faixa de validade no rodapé"),
  postQuadrado: ex("post-quadrado-hortifruti", 540, 540, "Post quadrado 1080×1080 — modelo Hortifrúti Fresco",
    "Post quadrado verde com o título Quarta Verde, tomate italiano em destaque por R$ 4,99 o quilo, banana, maçã e batata com preços"),
  postFeed: ex("post-feed-atacarejo", 540, 675, "Post vertical 1080×1350 — modelo Atacarejo Caixa",
    "Post vertical azul e amarelo com produtos em caixas, tomate italiano em destaque e preços com unidade"),
  story: ex("story-acougue", 432, 768, "Story e status 1080×1920 — modelo Açougue na Brasa",
    "Story vertical escuro com o título Festival do Churrasco, contrafilé bovino com preço de clube de R$ 42,90 o quilo e linguiça toscana de R$ 24,90 por R$ 19,90 o quilo"),
  cartazA4: ex("cartaz-a4-mega-ofertas", 560, 792, "Cartaz A4 — modelo Mega Ofertas",
    "Cartaz A4 rosa e preto com um único produto, tomate italiano, de R$ 6,99 por R$ 4,99 o quilo em uma explosão amarela"),
  cartazA3: ex("cartaz-a3-economia-total", 560, 791, "Cartaz A3 — modelo Economia Total",
    "Cartaz A3 com contrafilé bovino, preço de clube R$ 42,90 o quilo em destaque e preço normal informado embaixo"),
  etiquetas: ex("etiquetas-a4-vitrine-clean", 620, 877, "Folha A4 de etiquetas de preço — modelo Vitrine Clean",
    "Folha A4 com oito etiquetas de preço brancas e vermelhas, cada uma com nome do produto, embalagem, preço e unidade"),
  banner: ex("banner-vitrine-padaria", 1000, 375, "Banner da vitrine 1600×600 — modelo Padaria do Forno",
    "Banner horizontal marrom com o título Fornada de Ofertas, pão francês por R$ 14,99 o quilo e leite integral de R$ 5,79 por R$ 4,59"),
  tv: ex("tv-horizontal-bebidas", 960, 540, "Slide para TV 1920×1080 — modelo Gelada na Hora",
    "Slide horizontal azul para TV com o título Gelada na Hora e oito bebidas e produtos com preços"),
  videoQuadro: ex("video-vertical-quadro", 432, 768, "Quadro de um vídeo MP4 vertical de 15 segundos (estilo Deslizar)",
    "Quadro de vídeo vertical laranja e verde mostrando tomate italiano de R$ 6,99 por R$ 4,99 o quilo"),
  vitrine: ex("vitrine-digital-celular", 390, 844, "Vitrine digital da loja no celular",
    "Página da vitrine digital no celular com nome da loja, horário, busca, categorias e ofertas com preço de e por"),
  vitrineLista: ex("vitrine-lista-whatsapp", 390, 844, "Lista de interesse da vitrine, pronta para enviar pelo WhatsApp",
    "Vitrine no celular com três produtos marcados na lista de interesse, quantidades e botão para copiar a lista"),
} satisfies Record<string, Example>;

export type ExampleId = keyof typeof EXAMPLES;
