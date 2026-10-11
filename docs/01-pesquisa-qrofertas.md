# 01 — Pesquisa de concorrente: QR Ofertas

> Documento do agente de Produto & Pesquisa do **EncarteVarejo** (nome provisório).
> Data da coleta: **2026-10-11**. Escopo: somente páginas públicas. Nenhum login, cadastro ou envio de formulário foi feito. Nenhum arquivo de tema, foto ou código foi baixado ou copiado.
>
> Convenção: **[O]** = Observado (visto numa página pública, com URL). **[H]** = Hipótese (inferência nossa, precisa validar).
> Limitação de método: as páginas foram lidas com uma ferramenta que converte o HTML em texto e o resume. Não vimos as telas renderizadas, nem o editor logado. Textos citados são trechos curtos do conteúdo público.

---

## 1. Fontes consultadas (todas em 2026-10-11)

### 1.1 Páginas acessadas (WebFetch)

| # | URL | Resultado |
|---|-----|-----------|
| 1 | https://www.qrofertas.com/ | Público. O HTML da home já contém a "casca" do gerador (abas, grades, formatos, botões de exportação, termos de uso, preço). |
| 2 | https://www.qrofertas.com/criar-jornal/ | **Exige login** ("Área de Acesso": Email/Senha). |
| 3 | https://www.qrofertas.com/genio/ | **Exige login** (mesma tela de acesso). Conteúdo do "QR Gênios" não visível. |
| 4 | https://www.qrofertas.com/minha-assinatura/ (2 leituras) | Público: tabela de planos, recursos, FAQ. Assinar exige cadastro. |
| 5 | https://www.qrofertas.com/fale-conosco | Público: canais de contato. |
| 6 | https://www.qrofertas.com/modelos/supermercado | Público: catálogo de temas com filtros (formatos, segmentos, eventos, campanhas). |
| 7 | https://qrtvindoor.com/ | Público, mas só metadados legíveis (título, descrição, preço "a partir de"). |
| 8 | https://www.qrmidia.com/templates | Público: catálogo de templates "Modo Livre". Sem preços na página. |
| 9 | https://portal.qrofertas.com/ | Público: portal de ofertas para consumidores. |
| 10 | https://portal.qrofertas.com/supermercado | Público: página de categoria (ofertas carregadas dinamicamente; nenhuma loja visível na leitura). |
| 11 | https://portal.qrofertas.com/faq | Público: FAQ do portal. |
| 12 | https://lp.qrofertas.com/autonomia/ | Público: landing page de aquisição. |
| 13 | https://www.youtube.com/@qrofertas | Só descrição do canal; lista de vídeos não legível. |
| 14 | https://www.youtube.com/watch?v=xTq24G99bHs | **Falhou** ao carregar (título visto só no resultado de busca). |
| 15 | https://www.reclameaqui.com.br/empresa/qr-ofertas/ | Público: indicadores de reputação. |
| 16 | https://www.reclameaqui.com.br/empresa/qr-ofertas/lista-reclamacoes/ | Público: títulos de reclamações. |
| 17 | https://www.reclameaqui.com.br/qr-ofertas/site-instavel-com-muitos-erros_8NT7mlvskv5KDZPN/ | Público: reclamação + resposta. |
| 18 | https://www.reclameaqui.com.br/qr-ofertas/renovacao-de-assinatura-sem-autorizacao_pOBEGXy5cuyrAox-/ | Público: reclamação + resposta. |
| 19 | https://apps.apple.com/us/app/id6443417835 | Concorrente "Encarte Rápido" (App Store). |
| 20 | https://apps.apple.com/us/app/id1497151653 | Concorrente "Cartaz Fácil" (App Store). |
| 21 | https://supervarejo.com.br/varejo/feitos-a-mao-ou-por-impressoras-cartazes-destacam-ofertas-nos-supermercados | Matéria setorial sobre cartazes de preço. |

### 1.2 Buscas (WebSearch)

1. `QR Ofertas encartes supermercado` — resultados pouco relevantes (Canva, Tiendeo).
2. `"QR Ofertas" reclame aqui` — sem resultado direto.
3. `qrofertas youtube tutorial encarte como fazer` — sem resultado útil.
4. `gerador de encartes supermercado online reclamação dificuldade` — só reclamações de consumidores contra supermercados (ex.: produto do encarte em falta), não contra ferramentas.
5. `qrofertas` (busca estendida) — perfis sociais (Instagram "O melhor Gerador de Encartes do Mundo!", TikTok, Facebook, LinkedIn, Threads), canal YouTube, vídeo "COMO FAZER UM ENCARTE DE OFERTAS PELO CELULAR", portal, LP "Autonomia".
6. `aplicativo criar encarte supermercado cartaz preço ofertas software` — apps "Encarte Rápido", "Cartaz Fácil", "Cartaz Rápido App"; matéria SuperVarejo.
7. `"tabloide digital" OR "encarte fácil" gerador encartes` — Canva (modelos de encarte), artigo acadêmico "Tabloide de ofertas é coisa séria", job no Workana para diagramação de tabloides.
8. `"QR Ofertas" app google play avaliações encartes` — **nenhum app nativo do QR Ofertas encontrado**.
9. `"qrofertas" OR "qr ofertas" problema OR travando OR cancelar assinatura OR reclamação` — página da empresa no Reclame Aqui e reclamações específicas.
10. `reclameaqui qr-ofertas "temas que somem" ...` e 11. `reclameaqui.com.br qr-ofertas temas somem plataforma` — não retornaram as páginas individuais (só os títulos vistos na lista do item 16).

---

## 2. Mapa de funcionalidades do QR Ofertas

### 2.1 Produtos da "família QR" [O — home, menu]
- **Minhas Campanhas** (`/criar-jornal/`), o gerador de encartes.
- **QR Gênios** (`/genio/`): assistente de IA. Os termos de uso citam "Chat GPT" [O — home]. A FAQ fala em "Gênios especialistas em várias áreas" [O — minha-assinatura].
- **QR TV Indoor** (qrtvindoor.com): sinalização digital, "a partir de R$ 29,90" por TV/mês [O]. Playlists e cardápio digital aparecem só nas palavras-chave da página [H].
- **QR Mídia** (qrmidia.com): editor de templates "Modo Livre" com "Meus Designs", para padarias, farmácias, açougues e distribuidoras [O].
- **Portal de Ofertas** (portal.qrofertas.com + subdomínio por loja, ex. `seucomercio.qrofertas.com` citado na home) [O].
- **Gerenciador de Mídias** (`/criar-jornal/minhas-midias`) [O — link no menu da conta].

### 2.2 Abas do editor (lidas no HTML público da home; editor logado não visto) [O]
`Produtos · Temas · Datas · Sua Logo · Empresa · Fontes · Postar · Encarte · Portal`

Outros controles vistos no HTML:
- **Produtos:** "Editar Produtos", "Remover Todos os Produtos". Estado vazio: "Adicione um produto no menu Produtos".
- **Troca de modelo:** "Troque para qualquer modelo Sem perder os produtos já cadastrados". Ou seja, os dados ficam separados do tema.
- **Grades:** "Automático" e grades fixas de 1 a 20 produtos (ex.: "1 Produto - 1x1", "9 Produtos - 3x3", "20 Produtos - 4x5"), grades com destaque ("4 produtos + 1 destaque Direito") e **tabelas** de 10 e 20 produtos. A FAQ diz "1 a 16 produtos por página", número diferente do HTML [O, divergência].
- **Caixa do produto:** "Padrão" / "Inteligente". **Cores:** "Padrão" / "Inteligente".
- **Tamanho do texto:** "Texto Maior Possível", "Texto médio", "Texto mínimo".
- **Rodapé:** "Redondo Grande", "Quadrado Grande", "Quadrado Compacto".
- **Capa:** "Gerar Capa" (sugere encarte com capa e várias páginas) [H].
- **Navegação:** Anterior/Próximo, "Páginas", "Só esta página", **"Modo Leve"** (provável modo para aparelhos fracos) [H]. Zoom Auto e de 30% a 100%.
- A LP cita também "turbo", "legendas", "velocidade" e "gênio (correção automática de erros na lista)" [O — lp autonomia].

### 2.3 Formatos de saída [O — home e /modelos]
| Grupo | Formatos |
|---|---|
| Encarte | Encarte grande para impressão; Encarte A4 vertical; Encarte A4 horizontal |
| Cartaz | Cartaz A4 vertical; Cartaz A4 horizontal |
| Redes sociais | Feed Facebook quadrado; Feed/Reels Instagram; Status/Stories; "Vídeo tabela rede social" |
| TV | TV horizontal; TV vertical; Vídeo tabela TV horizontal/vertical |

A FAQ diz que cada encarte é salvo "em até 12 formatos diferentes" [O]. **Não vimos** etiqueta de preço (gôndola), cartaz A3, banner de vitrine nem formato 4:5 nomeado explicitamente.

### 2.4 Exportação e publicação [O — home]
- Escala de exportação de 1.0x ("Mínimo") a 8.0x. Arquivo em **PDF** ou **ZIP**. Botão "Imprimir" com rota de impressão própria.
- "Publicar na TV" com seleção de TVs ("0 TVs selecionadas").
- "Publicação Turbo" e envio para redes sociais ("Suas ofertas foram enviadas para publicação nas redes sociais").
- Publicação no Portal de Ofertas.

### 2.5 Catálogo de temas [O — /modelos/supermercado]
- Filtros: Modelos (formato), **Segmentos (58)**, **Eventos/datas (~64)** e **Campanhas (12: Ofertas da Semana, Festival do Real, Início de Mês, Aniversário, Dia D, Leve Mais Pague Menos, Fecha Mês, Inauguração, Feriado…)**.
- 24 temas por página e cerca de 40 páginas só no segmento Supermercado.
- A quantidade anunciada não bate entre as páginas: "Mais de 10.000 temas" (home/assinatura), "mais de 3.000" (termos e LP) e "4mil" (nome de imagem na LP) [O, divergência].
- Pedidos de tema por **votação**, com peso de voto diferente por plano [O — FAQ].
- Não é possível subir um template próprio. É possível encomendar um "Tema Exclusivo", pago à parte [O].

### 2.6 Portal de Ofertas (consumidor) [O — portal]
- Seletor de cidade, categorias (Supermercado, Hortifrúti, Açougue, Farmácia…), "Lista" de compras e "Favoritos". O consumidor navega sem conta.
- Cada oferta tem data de validade e sai do ar quando expira. A loja edita e remove ofertas em "Meus Encartes" [O — FAQ do portal].
- CTA para lojistas: "Publique em menos de 1 minuto", "Anuncie grátis".
- Na leitura não apareceu nenhuma loja ou oferta listada (página dinâmica ou sem resultados) [O]. Pode haver pouca densidade de ofertas por cidade [H].

### 2.7 Planos e preços públicos [O — minha-assinatura, home]
| Plano | Preço | Observações |
|---|---|---|
| Gratuito | R$ 0 | Sem prazo, "sem cartão", poucos temas, marca d'água nos temas Premium |
| Mensal | 1º mês R$ 4,90 (cartão); depois R$ 149,85 (cartão) ou R$ 169 (Pix/boleto) | Promoção de entrada |
| Trimestral | R$ 411,00 / 3 meses (~R$ 137/mês) | até 12x |
| Semestral | R$ 745,50 / 6 meses (~R$ 124/mês) | até 12x |
| Anual | R$ 1.303,50 / ano (~R$ 108/mês) | "Recomendado" |
| Vitalício | citado na FAQ, ausente da tabela | não cancelável |
| Tema Exclusivo | pagamento único | sob encomenda |
| QR TV Indoor | a partir de R$ 29,90 por TV/mês | produto separado |

- Todos os planos pagos têm os mesmos recursos (o plano muda só o prazo): gerador de encartes, cartazes e artes sociais; mídias para TV; publicador social; portal; "01 Ajuste de Logos"; suporte via WhatsApp; sem marca d'água [O].
- Pagamento por cartão (Stripe ou Mercado Pago), Pix e boleto. No plano mensal, Pix e boleto são combinados pelo WhatsApp. **Renovação automática** [O — termos].
- Suporte de seg. a sáb., das 9h às 23h, por WhatsApp e telefone [O — FAQ, fale-conosco].
- Funciona no navegador, no computador ou em Android novo, mas "recomenda-se computador" [O — FAQ]. Não há app nativo [O — busca].

---

## 3. Jornadas do usuário (inferidas) [H, salvo indicação]

1. **Descoberta:** Instagram, TikTok, YouTube ou anúncio leva à LP ("Encartes profissionais sem precisar de designer!") e ao "COMECE AGORA" [O].
2. **Experimentação sem conta:** a home abre direto no gerador, e o aviso "O que você está fazendo não será perdido se criar sua conta" sugere que dá para começar sem cadastro [O]. Depois, "Complete seu Cadastro, é grátis!" (e-mail, senha e telefone) [O].
3. **Montagem:** a loja cadastra produtos (nome, preço e imagem, que provavelmente vem de um banco de imagens) [H], escolhe tema por data ou campanha, sobe o logo e os dados da empresa e escolhe a grade (automática ou fixa) e as fontes.
4. **Ajuste:** troca de tema sem perder produtos [O], ajuste de tamanho de texto e da caixa, páginas extras e capa.
5. **Paywall:** o tema Premium aparece com marca d'água. O upsell do 1º mês por R$ 4,90 renova sozinho para cerca de R$ 150 [O]. As reclamações mostram atrito justamente nesse ponto (seção 4).
6. **Exportação:** escolha do formato (até 12) e da escala, depois download em PDF/ZIP ou impressão [O].
7. **Publicação:** "Postar" nas redes, "Publicar na TV" (TVs cadastradas no QR TV Indoor) e Portal com validade [O]. A frequência típica é semanal ou diária ("Ofertas da Semana", "Sabadão Verde") [H].
8. **Recorrência:** o lojista volta para editar encartes salvos. Se a assinatura vencer, o tema Premium deixa de ser editável [O — FAQ], o que gera um aprisionamento implícito [H].

---

## 4. Dificuldades e reclamações públicas

### 4.1 Observadas (com fonte)
- **Reputação no Reclame Aqui:** "Sem reputação definida" (menos de 10 avaliações). 100% de respostas e tempo médio de 3h no período de 01/02 a 31/07/2026. Há 11 reclamações ativas na lista [O — RA empresa e lista].
- **Cobrança e cancelamento** é o tema dominante. Títulos: "Cobrança indevida após cancelamento… dificuldade de estorno", "Cobrança indevida de assinatura não autorizada", "DIFICULDADE PRA CANCELAR", "Não consigo cancelar assinatura", "Propaganda Enganosa - Não cance…". O filtro do RA mostra "Estorno do valor pago" em 5 reclamações [O — RA lista/empresa].
- **Renovação após o R$ 4,90:** o cliente achou a plataforma difícil, não gostou dos modelos e foi cobrado na renovação. A empresa respondeu que o preço estava nos termos. O pedido foi feito às 22h24 e atendido no dia seguinte [O — RA renovação, 13/03/2025].
- **Instabilidade e erros:** "site apresenta mts erros". O cliente relatou "preços mudavam depois de salvar", configurações erradas e o site fora do ar "quando mais preciso" (de manhã, dois dias seguidos). A empresa atribuiu o problema a 4x de tráfego e prometeu aumentar os servidores [O — RA, 10/08/2024]. Outro título: "Site da assinatura não abre quando mais preciso" [O].
- **"TEMAS QUE SOMEM DA PLATAFORMA"** [O — título na lista RA; conteúdo não lido].
- **Inconsistências públicas:** número de temas (3.000, 4.000 ou 10.000+), preço (R$ 169 − R$ 20 aparece como R$ 149,85), produtos por página (16 ou 20), plano vitalício fora da tabela e contadores zerados na LP ("0 empresas") [O].
- **Uso no celular** só em Android e "recomenda-se computador" [O — FAQ]. Mesmo assim, há tutorial "pelo celular" no YouTube [O — busca].
- **Não é possível usar template ou identidade visual própria**, apenas encomendar tema exclusivo pago [O — FAQ].
- **Ajuste de logo** é serviço humano limitado ("01 Ajuste de Logos") [O].

### 4.2 Pontos fracos percebidos [H — validar com usuários e capturas]
- H1. Picos de uso em horários previsíveis (sexta à noite e manhãs de segunda e quinta) derrubam o serviço, porque a renderização de alta escala (até 8x) acontece no momento do pedido.
- H2. Cadastro de produtos manual e repetitivo. Não vimos importação de planilha, ERP/PDV ou leitura de código de barras (EAN).
- H3. Erros de preço: o próprio relato de "preço muda depois de salvar" mostra o risco. Não há indício de revisão ou aprovação antes de publicar, e um erro de preço vira obrigação legal de vender pelo valor anunciado.
- H4. O tema é o centro da experiência, e a marca da loja fica em segundo plano. Quem tem rede ou identidade forte fica preso a temas genéricos.
- H5. Sem multi-loja ou rede: preços e validades por filial, aprovação central e calendário compartilhado não aparecem nas páginas públicas.
- H6. Sem modo agência (vários clientes, cobrança por cliente, aprovação do cliente).
- H7. Portal com pouca densidade de ofertas por cidade e loja sem página própria forte (SEO, WhatsApp, horário, mapa).
- H8. Faltam formatos de PDV: etiqueta de gôndola, cartaz A3, faixa de vitrine e régua.
- H9. Monetização baseada em quantidade de temas e marca d'água, com recursos iguais em todos os planos pagos, o que deixa pouco espaço para cobrar mais de clientes maiores (redes).
- H10. Suporte concentrado em WhatsApp humano e FAQ curta, sem central de ajuda autosserviço visível.

---

## 5. Oportunidades para o EncarteVarejo (priorizadas)

Legenda: **P0** = MVP obrigatório · **P1** = logo após o MVP · **P2** = diferencial posterior.

### P0
**O1. Lista de produtos como fonte única, com importação rápida.** Colar do Excel/WhatsApp, enviar CSV/XLSX e buscar por EAN num catálogo base.
- *Aceitação:* colar 30 linhas no formato "Arroz Tio X 5kg 24,90" gera 30 produtos com nome, preço e unidade separados, com ≥ 90% de acerto num conjunto de teste de 100 linhas reais. CSV com colunas mapeáveis importa 200 itens em < 5 s.

**O2. Um conjunto de ofertas gera vários formatos de uma vez.** Encarte com N páginas, cartaz A4/A3, post 1:1, 4:5 e 9:16, TV 16:9 e vitrine.
- *Aceitação:* a partir de uma campanha com 24 produtos, o usuário exporta ≥ 7 formatos num único clique. Mudar um preço na lista atualiza todos os formatos sem refazer o layout manualmente (teste: alterar 1 preço e verificar o valor novo em todos os arquivos).

**O3. Proteção contra erro de preço (revisão antes de publicar).** Validações: preço de/por coerente, centavos válidos, unidade presente, validade definida e alerta de variação maior que X% em relação à campanha anterior.
- *Aceitação:* publicar ou exportar com produto sem preço, sem unidade ou com "de" ≤ "por" fica bloqueado com mensagem que aponta o item. A tela de revisão lista todos os preços em tabela antes da exportação final. Um preço salvo é idêntico, byte a byte, no arquivo exportado (teste automatizado).

**O4. Confiabilidade nos horários de pico.** Renderização em fila, com cache por campanha e versão.
- *Aceitação:* teste de carga com 500 exportações simultâneas mantém p95 < 30 s por formato, sem erro 5xx. Página de status pública. Rascunho salvo automaticamente a cada alteração, sem perda após fechar o navegador.

**O5. Cobrança transparente e cancelamento em 2 cliques.** Sem "R$ 4,90 que vira R$ 150" escondido.
- *Aceitação:* o cancelamento fica em Configurações e conclui em ≤ 2 cliques, sem falar com humano. E-mail/WhatsApp de aviso 3 dias antes de qualquer renovação ou fim de teste. O preço após o teste aparece no mesmo botão de assinatura.

**O6. Identidade da loja em primeiro lugar (brand kit).** Logo com remoção automática de fundo, cores, fontes, contato e endereço aplicados a qualquer layout.
- *Aceitação:* subir um logo JPG com fundo branco gera uma versão sem fundo em < 10 s. Trocar o tema mantém logo, cores de marca (se o usuário escolher) e rodapé. Brand kit editável sem suporte humano.

**O7. Mobile de verdade (Android e iOS, navegador).** O lojista monta a oferta no celular.
- *Aceitação:* o fluxo "colar lista → escolher modelo → exportar post 9:16 → compartilhar no WhatsApp" funciona em iPhone e Android de entrada (2 GB de RAM) em < 3 min, com Lighthouse mobile ≥ 80.

### P1
**O8. Formatos de PDV: etiqueta de gôndola e cartaz A3/A4 em lote.** Folha A4 com várias etiquetas e linha de corte.
- *Aceitação:* selecionar 40 produtos gera um PDF de etiquetas (ex.: 8 ou 16 por folha) com marcas de corte e preço legível a 2 m (altura mínima definida no design system). Cartazes saem 1 por página em lote.

**O9. Vitrine digital por loja (página pública com SEO).** URL própria, ofertas com validade, botão "pedir pelo WhatsApp", horário e mapa.
- *Aceitação:* publicar a campanha atualiza a vitrine em < 1 min. Ofertas expiradas somem automaticamente. A página tem meta tags e Open Graph corretas (validador) e LCP < 2,5 s em 4G.

**O10. Calendário de campanhas e aprovação.** Datas comerciais, rascunho → revisão → aprovado → publicado, com comentários.
- *Aceitação:* um usuário com papel "aprovador" recebe notificação. Um item não aprovado não pode ser publicado. O histórico registra quem aprovou e quando.

**O11. Redes e filiais.** Campanha matriz com preços e validades sobrescritos por filial.
- *Aceitação:* uma campanha com 3 filiais gera 3 conjuntos de arquivos com preços distintos onde houve sobrescrita e idênticos no resto. O relatório lista as divergências por filial.

**O12. Vídeo de ofertas e TV.** Slides animados 16:9 e 9:16, com playlist por URL para qualquer smart TV ou TV box.
- *Aceitação:* exporta MP4 de 15 a 60 s. Uma URL de player toca a campanha vigente em loop e muda sozinha quando a campanha expira.

**O13. Versionamento e histórico.** Os temas não "somem": cada campanha guarda o snapshot do tema usado.
- *Aceitação:* uma campanha antiga reabre idêntica mesmo se o tema sair do catálogo, e o usuário pode restaurar qualquer versão anterior.

### P2
**O14. Modo agência:** vários clientes, brand kits isolados, aprovação pelo cliente via link e cobrança por cliente. *Aceitação:* a agência alterna entre clientes sem logout, e o link de aprovação funciona sem conta.
**O15. IA assistiva:** sugestão de layout e destaques (ex.: produto com maior desconto ganha destaque), texto de legenda para post e correção de nomes. *Aceitação:* a sugestão nunca altera o preço sem confirmação explícita, e a legenda gerada inclui validade.
**O16. Integração ERP/PDV** (importar preços promocionais). *Aceitação:* conector com pelo menos 1 sistema popular faz importação agendada com log de erros.
**O17. Métricas:** visitas da vitrine, cliques no WhatsApp e QR do encarte impresso. *Aceitação:* o painel por campanha mostra visitas e cliques com atraso < 1 h.
**O18. Editor livre de elementos** sobre o layout automático, mantendo os dados ligados à lista. *Aceitação:* mover ou redimensionar uma caixa não desliga o vínculo preço↔lista.

---

## 6. Padrões visuais genéricos de encartes de supermercado no Brasil

Convenções gerais do setor, descritas sem reproduzir composições específicas de nenhum concorrente.

- **Hierarquia do preço:** o preço é o maior elemento da caixa do produto, maior que a foto em peso visual. O "R$" fica pequeno, à esquerda ou acima. Os **reais** são grandes e em negrito. Os **centavos** ficam sobrescritos (menores, alinhados ao topo dos reais), muitas vezes com vírgula pequena ou sem vírgula visível.
- **Unidade de venda** ao lado ou abaixo do preço: "kg", "un", "cada", "pct", "cx", "100 g", "L". Em hortifrúti e açougue, "kg" é obrigatório na leitura do cliente.
- **Preço "de/por"** (riscado → novo) e mecânicas como "Leve 3 Pague 2", "2 por R$ X", "a partir de", "no cartão da loja", "limite de X unidades por cliente".
- **Selos e splashes:** estouros ou estrelas com "OFERTA", "IMPERDÍVEL", "SÓ HOJE", "MENOR PREÇO", "%OFF". Cores quentes (vermelho e amarelo) dominam. Fundo de alto contraste em verde (hortifrúti), vermelho (açougue) e azul (limpeza/frios).
- **Cabeçalho** com nome da campanha ("Ofertas da Semana", "Quarta Verde", "Sabadão", data comemorativa) e logo da loja em destaque.
- **Faixa de validade** bem visível: "Ofertas válidas de dd/mm a dd/mm ou enquanto durarem os estoques", às vezes com "imagens meramente ilustrativas".
- **Grade** regular (2x2 a 4x5) com 1 a 3 produtos destacados em caixa maior. Seções por departamento (Mercearia, Açougue, Hortifrúti, Bebidas, Limpeza, Higiene).
- **Foto do produto** recortada, sem fundo, levemente sobreposta à caixa de preço. Nome em 1 ou 2 linhas com marca, variante e gramatura.
- **Rodapé** com logo, endereço(s) das lojas, telefone/WhatsApp, redes sociais, formas de pagamento (bandeiras, Pix), horário, aviso "reservamo-nos o direito de limitar quantidades" e, às vezes, QR code.
- **Cartaz de PDV:** produto e preço gigantes legíveis a distância, texto simples e direto, estilo consistente entre cartazes [O — SuperVarejo]. Há também o estilo "pintado à mão" (pincel atômico), que muitos lojistas consideram mais chamativo [O — SuperVarejo].
- **Pontos legais a validar com jurídico** [H]: oferta anunciada vincula o fornecedor ao preço (CDC arts. 30 e 35), publicidade enganosa (CDC art. 37), regras de exibição de preço (Lei 10.962/2004 e Decreto 5.903/2006, ex.: preço à vista em destaque e preço por unidade de medida) e bebidas alcoólicas ("Beba com moderação"/proibido para menores de 18). Esses pontos sustentam O3 (validação de preço) e campos de aviso legal no rodapé.

---

## 7. O que falta analisar: capturas de tela a pedir ao dono do projeto

Pedimos capturas da conta do usuário no QR Ofertas (sem dados sensíveis e sem códigos de pagamento):

1. Tela inicial após login ("Minhas Campanhas"/lista de encartes salvos).
2. Aba **Produtos**: formulário de cadastro, busca de imagem e se existe importação em lote, EAN ou planilha.
3. Banco de imagens de produtos: busca, qualidade, recorte e upload próprio.
4. Aba **Temas** e **Datas**: navegação, filtros, marcação Premium e marca d'água.
5. Aba **Sua Logo** e **Empresa**: campos disponíveis (endereço, WhatsApp, pagamentos, avisos).
6. Aba **Fontes** e opções de caixa, cor e texto "Inteligente" (antes e depois).
7. Seletor de **grades** com encarte de 20+ produtos e várias páginas, mais "Gerar Capa".
8. Tela de **exportação** (12 formatos, escala, PDF/ZIP) e um arquivo exportado de cada tipo, para avaliar qualidade e tempo.
9. Aba **Postar**: redes suportadas, conexão de conta, agendamento.
10. Aba **Portal** e a página pública da loja resultante.
11. **QR TV Indoor**: cadastro de TV, playlist e o que aparece na TV.
12. **QR Gênios**: exemplos de uso e o que a "correção automática da lista" faz.
13. **Minha Assinatura** logado: como cancelar (quantos passos) e avisos de renovação.
14. Comportamento no **celular** (Android/iOS) e "Modo Leve".
15. Qualquer tela de multi-loja, usuários/permissões ou aprovação, se existir.
16. Tempo real cronometrado: da lista de 20 produtos até o post publicado.

---

*Fim do documento. Próximo passo sugerido: validar as hipóteses H1–H10 com 5 a 8 entrevistas com donos ou gerentes de supermercados pequenos e médios e cruzar com as capturas da seção 7.*
