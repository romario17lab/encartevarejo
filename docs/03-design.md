# 03 — Design: identidade da plataforma e modelos de encarte

Dono: Agente de Design. Arquivos: `src/app/globals.css`, `tailwind.config.ts`, `src/components/ui/**`,
`src/templates/**` (exceto `contract.ts`), `src/render/fonts.css`, `src/app/modelos-amostra/**`.

---

## 1. Identidade visual da plataforma

**Conceito:** "etiqueta de feira bem organizada". Verde-mercado (confiança, frescor) como cor de marca,
laranja-etiqueta só para ações de destaque e amarelo-preço como realce de fundo (nunca texto).
Visual limpo e calmo na interface, para que as cores fortes fiquem nas peças que o lojista cria.

**Nome configurável:** `NEXT_PUBLIC_BRAND_NAME` (padrão "EncarteVarejo"), lido por
`src/components/ui/brand.ts` (`BRAND_NAME`, `brandName()`). Nunca escreva o nome fixo em componentes.

**Logo:** `src/components/ui/Logo.tsx` — `LogoMark` (símbolo: etiqueta de preço com canto chanfrado,
furo, três linhas de "lista de produtos" e selo de %) e `Logo` (símbolo + nome configurável). SVG próprio.

### 1.1 Tokens de cor (`globals.css`, usados via Tailwind)

| Token | Hex | Uso |
|---|---|---|
| `brand` | #0B6B4F | Botão primário, links, seleção |
| `brand-strong` | #085340 | Hover/pressionado, texto sobre `brand-soft` |
| `brand-soft` | #DFF3EA | Fundos de destaque suave, badges |
| `accent` | #C2410C | Ação de destaque (ex.: Exportar), foco |
| `highlight` | #FFD23F | Realce de fundo (selo "demonstração", marca-texto) |
| `ink` | #16211C | Texto principal |
| `ink-muted` | #4F5B55 | Texto secundário, dicas |
| `surface` / `surface-alt` | #FFFFFF / #F6F7F2 | Cartões / fundo da página |
| `line` | #DFE3DA | Divisórias decorativas |
| `line-strong` | #7A857F | Bordas de campos e controles |
| `success` / `warning` / `danger` | #15803D / #A15C07 / #C62828 | Estados |

### 1.2 Contraste (WCAG 2.x, calculado com `src/templates/parts/color.ts › contrast`)

| Par | Razão | Critério |
|---|---|---|
| branco sobre `brand` | 6,50:1 | AA texto normal ✔ |
| branco sobre `brand-strong` | 9,05:1 | AAA ✔ |
| branco sobre `accent` | 5,18:1 | AA ✔ |
| `ink` sobre branco | 16,56:1 | AAA ✔ |
| `ink` sobre `surface-alt` | 15,38:1 | AAA ✔ |
| `ink-muted` sobre branco | 7,09:1 | AAA ✔ |
| `ink-muted` sobre `surface-alt` | 6,59:1 | AA ✔ |
| `brand-strong` sobre `brand-soft` | 7,82:1 | AAA ✔ |
| `success` / `warning` / `danger` sobre branco | 5,02 / 5,19 / 5,62:1 | AA ✔ |
| `ink` sobre `highlight` | 11,46:1 | AAA ✔ |
| `accent` sobre `surface-alt` | 4,81:1 | AA ✔ |
| `line-strong` (borda de campo) sobre branco | 3,83:1 | 1.4.11 componentes ≥ 3:1 ✔ |
| `line` sobre branco | 1,30:1 | apenas decorativo (não usar como única borda de controle) |

Descartado: laranja #D9480F (4,30:1 com branco — reprovado para texto normal).

### 1.3 Tipografia, espaço e forma

- Interface: **Inter** (texto, 15 px em campos para evitar zoom no iOS) e **Montserrat** 800 (`font-display`) em títulos.
  As fontes vêm de `@fontsource` (sem rede externa), importadas por `globals.css → src/render/fonts.css`.
- Escala: 12 / 14 / 15 / 16 / 18 / 24 / 30 px. Números de preço: classe `.ev-num` (algarismos tabulares).
- Espaço: múltiplos de 4 px; cartões `p-4`, seções `gap-6`.
- Raios: 8 (`--ev-radius-sm`), 12 (`rounded-xl`, botões e campos), 20 px (`rounded-2xl`, cartões e diálogos).
- Sombra única `shadow-card` (suave, duas camadas).

### 1.4 Ícones

`src/components/ui/icons.tsx`: SVG inline 24×24, traço 2 px, `currentColor`, cantos arredondados.
Decorativos por padrão (`aria-hidden`); passe `title` quando o ícone for o único rótulo de um botão
(ou use `aria-label` no botão). Ícones de contato dos modelos são outros (em `templates/parts/glyphs.tsx`),
desenhados genéricos — o de WhatsApp é um balão de conversa, não o logotipo do aplicativo.

### 1.5 Regras de componentes (`src/components/ui/index.tsx`)

- **Button:** primário = 1 por tela/área; `accent` só para a ação principal do fluxo (ex.: exportar).
  Alturas: md 44 px, lg 52 px (área de toque ≥ 44 px); `sm` (36 px) só em barras densas no desktop.
  `loading` desativa e anuncia (`aria-busy`).
- **Campos:** rótulo sempre visível (`label` ligado por `htmlFor`), erro com `role="alert"` e
  `aria-describedby`, borda `line-strong`, foco com anel `brand/25` + contorno do `:focus-visible`.
- **PriceInput:** valor em centavos, digitação só de números, "R$" fixo à esquerda.
- **Dialog:** vira folha inferior no celular, fecha com Esc e clique fora, devolve o foco, botão fechar 44 px.
- **Tabs:** `role="tablist"`, setas ← → trocam de aba, só a aba ativa entra na ordem do Tab.
- **Toast:** `role="status"` (erro: `alert`), some em 4,5 s.
- **Estados:** vazio (`EmptyState`, borda tracejada + ação), erro (`ErrorState` com "Tentar novamente"),
  carregando (`Spinner` com rótulo), desativado (50 % de opacidade + cursor bloqueado).

### 1.6 Responsivo

- Mobile-first; tudo funciona em **390 px**: uma coluna, diálogos como folha inferior, tabelas viram listas.
- Pontos de quebra Tailwind padrão (`sm` 640, `md` 768, `lg` 1024, `xl` 1280).
- Sem rolagem horizontal da página; listas largas rolam dentro do próprio contêiner (Tabs, galerias).
- `prefers-reduced-motion` desliga animações.

---

## 2. Modelos de encarte

### 2.1 Arquitetura

```
src/templates/
  registry.ts            TEMPLATE_VERSIONS (todas as versões, nunca remover), getTemplate, listTemplates
  <slug>/v1.tsx          um modelo = metadados + paleta + fontes + regras de layout + Skin + decorações
  parts/
    defineTemplate.tsx   monta o TemplateDefinition; renderPage desenha nos retângulos do motor
    PriceTag.tsx         etiqueta de preço (todas as mecânicas) + DiscountBadge
    ProductCard.tsx      card por CellSize/proporção; ProductPhoto (sem distorção); nameBlock
    Header.tsx Footer.tsx Extras.tsx (DemoWatermark, SectionTitle) TagSheet.tsx (etiquetas + marcas de corte)
    decor.tsx            ornamentos próprios em SVG/CSS (raios, xadrez, folhas, neve, bolhas, trigo...)
    color.ts text.ts metrics.ts glyphs.tsx types.ts
  demo-data.ts demo-images.ts   dados e ilustrações de demonstração
  __dev__/               scripts de desenvolvimento (amostras, verificação de transbordo)
```

**Divisão de trabalho:** o motor (`src/layout/engine.ts`) decide páginas, cabeçalho/corpo/rodapé e células;
o modelo só desenha dentro de `page.header`, `page.cells[].rect`, `page.sections`, `page.footer`.
Raiz de cada página: `position:relative`, tamanho exato do formato, `overflow:hidden`, `data-ev-root`.

**Marcadores para verificações:** `data-ev-cell` (card), `data-ev-price` (bloco do preço),
`data-ev-price-inner` + `data-ev-text` (conteúdo do preço que não pode ser cortado), `data-ev-name`,
`data-ev-badge`, `data-ev-hero`, `data-ev-title`, `data-ev-demo`.

**Cores:** sempre de `props.colors` (já mescladas pelo `PieceRenderer`). Todo texto sobre cor passa por
`ensureContrast/readableOn`: se a loja aplicar cores próprias que derrubem o contraste, o texto troca
automaticamente para claro/escuro.

**Ajuste de texto sem DOM:** larguras médias por fonte medidas no Chromium (`__dev__/measure-fonts.ts` →
`parts/metrics.ts`). `fitText` escolhe o maior tamanho que cabe em N linhas sem quebrar palavras;
nomes longos reduzem em passos de 4 % até um mínimo legível e então são cortados em 2–3 linhas
(o motor emite o aviso `long_name_truncated`). O preço é dimensionado pela largura real dos algarismos.

### 2.2 Regras visuais (todas os modelos)

- Preço é o maior elemento do card: "R$" pequeno, reais grandes, centavos sobrescritos com vírgula,
  unidade abaixo dos centavos (`/kg`, `/100g`, `un`, `pct`, `cada` em "a partir de").
- **De/por:** "De ~~R$ 6,99~~ por" com risco real (`<s>`), selo "-28%" calculado por `discountPercent`
  (arredonda para baixo) só quando o preço anterior foi informado.
- **Leve N:** "Leve 3 por R$ 12,00"; "Sai R$ 4,00 cada" só quando a divisão é exata; "Unidade R$ x" se informado.
- **A partir de:** "A partir de 6 un" + preço + "cada"; "Preço normal" se informado.
- **Clube:** etiqueta com o nome do clube, preço de clube em destaque e "Preço normal R$ x" visível.
- Limite por cliente, forma de pagamento e condições em linhas pequenas (até 2 linhas).
- Preço ausente: "Preço não informado" tracejado (nunca um valor inventado).
- Foto: `object-fit: contain` + enquadramento `imageFit` (posição e zoom dentro de `overflow:hidden`),
  nunca esticada. Sem foto: área neutra com ícone e "sem foto".
- Rodapé: validade em destaque, endereço, telefone, WhatsApp, horário, redes; texto legal SOMENTE de
  `campaign.legalText`. Conteúdo do cabeçalho/rodapé respeita `format.safeAreaPx` (story: 120 px).
- Demonstração: `campaign.isDemo` ⇒ faixa "DADOS DE DEMONSTRAÇÃO" + marca d'água diagonal.
- Etiquetas (A4, 8 × 95×65 mm): faixa com rótulo do modelo e nome da loja, nome, preço grande, validade,
  marcas de corte nas margens alinhadas a todas as linhas de corte.
- Cartaz: nome grande no topo, foto ao centro, preço gigante (≈ 40 % da altura).

### 2.3 Catálogo (versão 1)

| id | Nome | Segmentos | Estilo | Assinatura visual |
|---|---|---|---|---|
| feira-da-semana | Feira da Semana | supermercado, hortifrúti | popular | vermelho/amarelo, raios de sol, preço em estouro, faixa xadrez |
| hortifruti-fresco | Hortifrúti Fresco | hortifrúti, supermercado | moderno | verde-folha, onda e folhas, cards arredondados, preço em pílula |
| acougue-na-brasa | Açougue na Brasa | açougue | popular | carvão, borda de chamas, Bebas Neue, preço em lousa vermelha |
| padaria-do-forno | Padaria do Forno | padaria | elegante | creme/marrom, toldo recortado, trigo, serifada, preço em selo |
| gelada-na-hora | Gelada na Hora | bebidas | moderno | azul em degradê, bolhas e gelo, Oswald, faixa amarela |
| economia-total | Economia Total | supermercado, varejo | econômico | amarelo/preto, meio-tom, sombra sólida, 16 itens/A4 |
| vitrine-clean | Vitrine Clean | varejo, supermercado | moderno | branco minimalista, preço tipográfico coral |
| emporio-gourmet | Empório Gourmet | supermercado, padaria | elegante | verde profundo, moldura dourada, Playfair |
| natal-em-familia | Natal em Família | sazonal, supermercado | elegante | vermelho/pinheiro/dourado, neve, luzes, preço em fita |
| mega-ofertas | Mega Ofertas | sazonal, varejo, supermercado | popular | preto/neon/magenta, raios; sem data fixa (saldão, aniversário, semanas de desconto) |
| atacarejo-caixa | Atacarejo Caixa Fechada | supermercado, varejo | econômico | kraft, fitas, estêncil, etiqueta pendurada, 15 itens/A4 |
| casa-e-limpeza | Casa & Limpeza | varejo, supermercado | moderno | azul/água, bolhas, ondas, faixa azul |

Todos suportam os 9 formatos. `natal-em-familia` e `mega-ofertas` usam `useBrandColors: false`
(a paleta temática é a identidade da peça; logo e contatos continuam da loja).

### 2.4 Como criar um modelo novo ou uma nova versão

1. Copie uma pasta, ajuste `id`, `name`, `palette`, `fonts` (só famílias de `src/render/fonts.css`), `skin` e decorações.
2. Mudança visual num modelo existente = **nova versão** (`v2.tsx`, `version: 2`), registrada ao lado da v1.
3. Rode `npx tsx src/templates/__dev__/check-overflow.ts --only=<id>` e `samples.tsx --only=<id>`.

---

## 3. Verificação

- `npx tsx src/templates/__dev__/check-overflow.ts` — 12 modelos × 9 formatos × 7 cenários (1, 12 e 40
  produtos, nomes longos, sem fotos, por categoria com cabeçalhos, fonte 130 %): preço dentro do card,
  conteúdo do preço sem corte, selos/nome dentro do card, nome sem sobrepor o preço, cards dentro da página
  e sem sobreposição, título sem corte.
- `npx tsx src/templates/__dev__/samples.tsx` — gera as PNGs em `/mnt/project-files/encartevarejo/amostras/`
  e a folha de contato `00-visao-geral.png`.
- Galeria no app: `/modelos-amostra` (dev; em produção exige `EV_SHOW_SAMPLES=1`).

## Versão 2 dos modelos (2026-10-11)

Pedido do responsável: modelos mais chamativos, no nível visual dos temas de referência (ver `docs/01c-analise-visual-temas.md`), com arte 100% própria. Cada modelo ganhou a `version: 2` com o mesmo id; a v1 continua no registro e campanhas antigas mantêm a versão fixada. Peças compartilhadas em `src/templates/parts2/` (título 3D, fundos em camadas, objetos SVG próprios, fitas, placa de preço com aba "POR", estrela de desconto, rodapé em pílula).

| Modelo | Cabeçalho e página | Objeto | Placa de preço |
|---|---|---|---|
| feira-da-semana | raios vermelhos, borda xadrez | carrinho | preta |
| hortifruti-fresco | madeira, folhas sobre verde | caixote | verde |
| acougue-na-brasa | chamas, papel vinho com dourado | churrasqueira | escura |
| padaria-do-forno | raios marrons, trigo sobre caramelo | pão | escura |
| gelada-na-hora | gelo, bolhas sobre azul | balde de gelo | azul-marinho |
| economia-total | azul royal com confete | etiqueta | escura |
| vitrine-clean | listras coral | sacola | azul-marinho |
| emporio-gourmet | preto com brilhos dourados | vinho | preta e dourada |
| natal-em-familia | vermelho com neve | presente | vermelha |
| mega-ofertas | raios de fogo, faixa zebrada | megafone | preta |
| atacarejo-caixa | papel kraft | palete | preta |
| casa-e-limpeza | violeta com bolhas | borrifador | violeta escura |

Hortifrúti, açougue, padaria, gelada e empório usam a paleta temática (`useBrandColors: false`); logo e contatos da loja continuam aplicados.
Checagem: `npx tsx src/templates/__dev__/check-overflow.ts --version=2` (756 renderizações, 0 problemas). Amostras: `npx tsx src/templates/__dev__/samples.tsx --version=2`.

## Versão 3 dos modelos (2026-10-11)

A versão 3 aplica as técnicas de `docs/01d-analise-canva.md`. Os 12 modelos mantêm os mesmos ids, ficam em `src/templates/<id>/v3.tsx` e são registrados depois das versões 1 e 2, que continuam iguais. O código compartilhado fica em `src/templates/parts3/`:

- `look3.ts`: tipos do visual, paletas por segmento (`SEGMENT_PALETTES`) e `ground3()`.
- `layers.tsx`: fundo em camadas (listras, raios, pontos, palavra da campanha, grade, ondas, confete, textura) com intensidade ajustável.
- `PriceTag3.tsx`: formatos da etiqueta de preço, todos na ordem R$ / inteiro / centavos / selo da unidade. Os formatos são placa, pílula, etiqueta, círculo, selo, solto, bandeira, ticket e explosão. Quando falta espaço, um formato redondo vira o parente largo mais próximo.
- `Title3.tsx`: título em camadas, com faixa inclinada ou cursiva (Playfair Display Italic). Em TV e banner fica numa linha só.
- `Card3.tsx`: estilos de card (recorte, orelha, círculo, hexágono, split, moldura, arco). A foto sai do card sem distorção e nunca cobre o nome nem o preço. Há também o destaque em pedestal ou em placa.
- `deco.tsx`: elementos de profundidade cortados pela borda da página e kits sazonais (`SEASON_KITS`: natal, páscoa, mães, black friday, arraiá), aplicados com `withKit(look, kit)`.
- `Header3.tsx`, `Footer3.tsx`, `Tags3.tsx`, `define3.tsx`: cabeçalho, rodapé, etiquetas e fábrica dos modelos.

| Modelo | Preço | Card | Fundo | Título |
|---|---|---|---|---|
| feira-da-semana | placa preta, contorno amarelo | recorte | vermelho com listras e palavra | faixa |
| hortifruti-fresco | etiqueta amarela | círculo | verde com pontos e folhas | cursiva |
| acougue-na-brasa | bandeira dourada | moldura escura | madeira | faixa vinho |
| padaria-do-forno | círculo marrom | orelha | papel com pontos | cursiva |
| gelada-na-hora | pílula marinho | hexágono | azul com raios e bolhas | faixa branca |
| economia-total | solto (dígitos com contorno) | split branco e preto | listras de alerta amarelas | faixa |
| vitrine-clean | ticket coral | recorte com borda | papel com grade | faixa (Montserrat) |
| emporio-gourmet | selo dourado | arco creme | verde com listras douradas | cursiva |
| natal-em-familia | etiqueta vermelha, contorno dourado | moldura creme | pinheiro com neve, kit natal | cursiva |
| mega-ofertas | explosão amarela | orelha magenta | carvão com raios magenta | faixa |
| atacarejo-caixa | ticket preto | orelha laranja | kraft com listras | faixa (Bebas) |
| casa-e-limpeza | círculo violeta | split branco e água | violeta com ondas | faixa (Montserrat) |

**Densidade** (`BASE_RULES_V3`): encarte 16 por página, post quadrado 4, post feed 6, story 3 por tela, banner 3, TV 6, cartaz 1 (destaque).

**Rodapé**: o rodapé usa só dados da loja. Ordem: WhatsApp, endereço, horário, entrega (só se a loja tiver esse dado, que hoje não existe), telefone, Instagram, site. A validade fica em destaque, e "Oferta válida enquanto durar o estoque" é acrescentado quando o texto de validade ainda não fala de estoque.

**Cores da marca**: aplicadas por `strong()` e `pop()` em feira, economia, vitrine, atacarejo e casa. Os outros modelos usam a paleta do segmento.

**Checagem**: `npx tsx src/templates/__dev__/check-overflow.ts --version=3`, com 864 renderizações e 0 problemas. Há um caso novo, `fotos-proporcao`, com fotos muito largas, muito altas, minúsculas e grandes. Há também uma regra nova para v3 ou mais: "foto sobre o nome".

**Amostras**: `npx tsx src/templates/__dev__/samples.tsx --version=3 --extras=<ids>` gera os arquivos em `amostras-v3/`. Os kits sazonais saem com `npx tsx src/templates/__dev__/kits.tsx`.
