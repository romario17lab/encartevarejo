// DADOS DE DEMONSTRAÇÃO — loja fictícia "Mercado Exemplo", produtos genéricos SEM marcas reais,
// preços fictícios apenas para visualizar os modelos. Toda campanha gerada tem isDemo=true,
// o que faz os modelos exibirem a marca d'água "DADOS DE DEMONSTRAÇÃO".
import type { RenderCampaign, RenderItem } from "@/domain/campaign";
import { emptyOffer, type Offer, type Unit } from "@/domain/offer";
import { demoImageUrl } from "./demo-images";

type P = { name: string; sizeLabel: string | null; unit: Unit; category: string; img: string | null; offer: Partial<Offer> };

const o = (x: Partial<Offer>): Partial<Offer> => x;

/** Catálogo fictício (ordem pensada para variar mecânicas, categorias e proporções de imagem). */
export const DEMO_PRODUCTS: P[] = [
  { name: "Tomate italiano", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "tomate", offer: o({ mode: "from_to", priceCents: 499, regularCents: 699 }) },
  { name: "Banana prata", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "banana", offer: o({ mode: "simple", priceCents: 389 }) },
  { name: "Biscoito recheado sabor chocolate com avelã embalagem família 400g", sizeLabel: "Pacote 400g", unit: "pct", category: "Mercearia", img: "biscoito", offer: o({ mode: "combo", priceCents: null, comboQty: 3, comboCents: 1200, regularCents: 499 }) },
  { name: "Água mineral sem gás", sizeLabel: "Garrafa 1,5L", unit: "un", category: "Bebidas", img: "garrafa", offer: o({ mode: "min_qty", priceCents: 249, minQty: 6, regularCents: 319 }) },
  { name: "Contrafilé bovino", sizeLabel: "Peça ou bife", unit: "kg", category: "Açougue", img: "carne", offer: o({ mode: "club", priceCents: 4999, clubCents: 4290, clubName: "Clube Exemplo" }) },
  { name: "Pão francês", sizeLabel: null, unit: "kg", category: "Padaria", img: "pao", offer: o({ mode: "simple", priceCents: 1499 }) },
  { name: "Leite integral UHT", sizeLabel: "Caixa 1L", unit: "un", category: "Laticínios", img: "leite", offer: o({ mode: "from_to", priceCents: 459, regularCents: 579, limitPerCustomer: 12 }) },
  { name: "Queijo muçarela fatiado", sizeLabel: "Bandeja 150g", unit: "bdj", category: "Frios", img: "queijo", offer: o({ mode: "simple", priceCents: 899, paymentNote: "no Pix" }) },
  { name: "Maçã gala", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "maca", offer: o({ mode: "from_to", priceCents: 799, regularCents: 1099 }) },
  { name: "Ovos brancos grandes", sizeLabel: "Bandeja com 30", unit: "bdj", category: "Mercearia", img: "ovos", offer: o({ mode: "simple", priceCents: 1890 }) },
  { name: "Sabão em pó multiação", sizeLabel: "Caixa 1,6kg", unit: "cx", category: "Limpeza", img: "caixa", offer: o({ mode: "from_to", priceCents: 1990, regularCents: 2690, conditions: "Fragrâncias sortidas" }) },
  { name: "Arroz branco tipo 1", sizeLabel: "Pacote 5kg", unit: "pct", category: "Mercearia", img: "sacola", offer: o({ mode: "simple", priceCents: 2490, limitPerCustomer: 3 }) },
  { name: "Refrigerante sabor guaraná", sizeLabel: "Garrafa 2L", unit: "un", category: "Bebidas", img: "garrafa", offer: o({ mode: "combo", priceCents: null, comboQty: 2, comboCents: 1000 }) },
  { name: "Feijão carioca", sizeLabel: "Pacote 1kg", unit: "pct", category: "Mercearia", img: null, offer: o({ mode: "simple", priceCents: 749 }) },
  { name: "Linguiça toscana", sizeLabel: null, unit: "kg", category: "Açougue", img: "carne", offer: o({ mode: "from_to", priceCents: 1990, regularCents: 2490 }) },
  { name: "Bolo caseiro de fubá", sizeLabel: "Unidade 500g", unit: "un", category: "Padaria", img: "pao", offer: o({ mode: "simple", priceCents: 1290 }) },
  { name: "Iogurte natural integral", sizeLabel: "Pote 170g", unit: "un", category: "Laticínios", img: "leite", offer: o({ mode: "min_qty", priceCents: 279, minQty: 4 }) },
  { name: "Detergente líquido neutro", sizeLabel: "Frasco 500ml", unit: "un", category: "Limpeza", img: "garrafa", offer: o({ mode: "simple", priceCents: 229 }) },
  { name: "Café torrado e moído tradicional", sizeLabel: "Pacote 500g", unit: "pct", category: "Mercearia", img: "sacola", offer: o({ mode: "club", priceCents: 2199, clubCents: 1899, clubName: "Clube Exemplo" }) },
  { name: "Batata lavada", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "tomate", offer: o({ mode: "simple", priceCents: 449 }) },
  { name: "Suco de uva integral", sizeLabel: "Garrafa 1,5L", unit: "garrafa", category: "Bebidas", img: "garrafa", offer: o({ mode: "from_to", priceCents: 1599, regularCents: 1999 }) },
  { name: "Frango inteiro congelado", sizeLabel: null, unit: "kg", category: "Açougue", img: "carne", offer: o({ mode: "simple", priceCents: 1149, limitPerCustomer: 2 }) },
  { name: "Papel higiênico folha dupla neutro", sizeLabel: "Pacote com 12 rolos", unit: "pct", category: "Limpeza", img: "caixa", offer: o({ mode: "simple", priceCents: 1990 }) },
  { name: "Manteiga com sal", sizeLabel: "Pote 200g", unit: "un", category: "Laticínios", img: "queijo", offer: o({ mode: "simple", priceCents: 1099, paymentNote: "à vista" }) },
  { name: "Macarrão espaguete com ovos", sizeLabel: "Pacote 500g", unit: "pct", category: "Mercearia", img: "sacola", offer: o({ mode: "combo", priceCents: null, comboQty: 4, comboCents: 1500, regularCents: 449 }) },
  { name: "Alface crespa hidropônica", sizeLabel: null, unit: "un", category: "Hortifrúti", img: null, offer: o({ mode: "simple", priceCents: 299 }) },
  { name: "Costela bovina para churrasco", sizeLabel: null, unit: "kg", category: "Açougue", img: "carne", offer: o({ mode: "from_to", priceCents: 2690, regularCents: 3290 }) },
  { name: "Pão de forma integral", sizeLabel: "Pacote 400g", unit: "pct", category: "Padaria", img: "pao", offer: o({ mode: "simple", priceCents: 899 }) },
  { name: "Cerveja tipo pilsen", sizeLabel: "Lata 350ml", unit: "lata", category: "Bebidas", img: "garrafa", offer: o({ mode: "min_qty", priceCents: 329, minQty: 12, conditions: "Venda proibida para menores de 18 anos" }) },
  { name: "Açúcar cristal", sizeLabel: "Pacote 5kg", unit: "pct", category: "Mercearia", img: "sacola", offer: o({ mode: "simple", priceCents: 2290 }) },
  { name: "Mamão formosa", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "maca", offer: o({ mode: "simple", priceCents: 599 }) },
  { name: "Presunto cozido fatiado", sizeLabel: null, unit: "100g", category: "Frios", img: "queijo", offer: o({ mode: "simple", priceCents: 349 }) },
  { name: "Amaciante de roupas concentrado", sizeLabel: "Frasco 1,5L", unit: "un", category: "Limpeza", img: "garrafa", offer: o({ mode: "from_to", priceCents: 1490, regularCents: 1890 }) },
  { name: "Óleo de soja", sizeLabel: "Garrafa 900ml", unit: "un", category: "Mercearia", img: "garrafa", offer: o({ mode: "simple", priceCents: 749, limitPerCustomer: 6 }) },
  { name: "Panetone de frutas", sizeLabel: "Caixa 400g", unit: "cx", category: "Padaria", img: "caixa", offer: o({ mode: "from_to", priceCents: 1990, regularCents: 2490 }) },
  { name: "Cebola", sizeLabel: null, unit: "kg", category: "Hortifrúti", img: "tomate", offer: o({ mode: "simple", priceCents: 399 }) },
  { name: "Picanha bovina resfriada", sizeLabel: null, unit: "kg", category: "Açougue", img: "carne", offer: o({ mode: "club", priceCents: 7990, clubCents: 6990, clubName: "Clube Exemplo" }) },
  { name: "Energético sabor tradicional", sizeLabel: "Lata 250ml", unit: "lata", category: "Bebidas", img: "garrafa", offer: o({ mode: "simple", priceCents: 799 }) },
  { name: "Esponja dupla face", sizeLabel: "Pacote com 4", unit: "pct", category: "Limpeza", img: "caixa", offer: o({ mode: "simple", priceCents: 549 }) },
  { name: "Chocolate ao leite em barra", sizeLabel: "Barra 90g", unit: "un", category: "Mercearia", img: "biscoito", offer: o({ mode: "combo", priceCents: null, comboQty: 3, comboCents: 1399 }) },
];

export const DEMO_LONG_NAME = "Biscoito recheado sabor chocolate com avelã embalagem família 400g";

export const DEMO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" width="360" height="120"><title>Logo fictício de demonstração</title><rect x="4" y="10" width="100" height="100" rx="26" fill="#0f6b4f"/><path d="M30 84V40l24 26 24-26v44" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/><text x="120" y="58" font-family="Arial" font-weight="800" font-size="38" fill="#0f6b4f">Mercado</text><text x="120" y="98" font-family="Arial" font-weight="800" font-size="38" fill="#f08a24">Exemplo</text></svg>`;

export interface DemoOptions {
  /** começa a partir deste índice do catálogo (para variar os itens) */
  offset?: number;
  /** força nomes longos em todos os itens */
  longNames?: boolean;
  /** sem imagens (testa o espaço reservado "sem foto") */
  noImages?: boolean;
  /** usa um logo fictício em vez do nome da loja */
  withLogo?: boolean;
  /** marca os N primeiros como destaque */
  highlights?: number;
  title?: string;
  subtitle?: string | null;
  /** itens filtrados por categoria (ex.: ["Açougue"]) — completa com o resto do catálogo se faltar */
  categories?: string[];
}

export function demoItems(n: number, opts: DemoOptions = {}): RenderItem[] {
  const pool = opts.categories?.length
    ? [...DEMO_PRODUCTS.filter((p) => opts.categories!.includes(p.category)), ...DEMO_PRODUCTS.filter((p) => !opts.categories!.includes(p.category))]
    : DEMO_PRODUCTS;
  const out: RenderItem[] = [];
  for (let i = 0; i < n; i++) {
    const p = pool[(i + (opts.offset ?? 0)) % pool.length];
    const round = Math.floor((i + (opts.offset ?? 0)) / pool.length);
    out.push({
      id: `demo-${i + 1}`,
      name: opts.longNames ? `${p.name} ${DEMO_LONG_NAME.toLowerCase()}`.slice(0, 120) : p.name,
      brand: null,
      sizeLabel: p.sizeLabel,
      unit: p.unit,
      category: p.category,
      imageUrl: opts.noImages || !p.img ? null : demoImageUrl(p.img),
      imageFit: { x: 50, y: 50, zoom: 1 },
      offer: { ...emptyOffer(), ...p.offer } as Offer,
      highlight: i < (opts.highlights ?? 1) && round === 0,
    });
  }
  return out;
}

/** Campanha de demonstração completa (isDemo = true). */
export function demoCampaign(n: number, opts: DemoOptions = {}): RenderCampaign {
  return {
    id: "demo-campanha",
    version: 1,
    title: opts.title ?? "Ofertas da Semana",
    subtitle: opts.subtitle === undefined ? "Só de quinta a domingo!" : opts.subtitle,
    validityText: "Ofertas válidas de 15/10 a 18/10/2026 ou enquanto durarem os estoques",
    legalText: "Imagens meramente ilustrativas. Dados de demonstração: preços e produtos fictícios.",
    items: demoItems(n, opts),
    brand: {
      storeName: "Mercado Exemplo",
      logoUrl: opts.withLogo ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEMO_LOGO_SVG)}` : null,
      colors: { primary: "#0f6b4f", secondary: "#f08a24", accent: "#ffd23f", text: "#1b1b1b", background: "#ffffff" },
      phone: "(00) 1234-5678",
      whatsapp: "(00) 91234-5678",
      address: "Rua Exemplo, 123 · Centro · Cidade Exemplo",
      instagram: "@mercadoexemplo",
      website: null,
      hours: "Seg a Sáb 7h–21h · Dom 7h–13h",
    },
    isDemo: true,
  };
}
