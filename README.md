# EncarteVarejo (nome provisório)

Plataforma SaaS para supermercados, hortifrútis, açougues, padarias e mercadinhos transformarem uma lista de produtos em uma campanha promocional completa: encarte de várias páginas, posts, story, cartazes A4/A3, etiquetas de preço, banner da vitrine e slide para TV, todos a partir dos mesmos dados.

O nome da marca é configurável por `NEXT_PUBLIC_BRAND_NAME`.

## Estado atual (Etapas 1 a 5 concluídas)

Funciona de ponta a ponta: cadastro → loja e identidade visual → catálogo → campanha (modo rápido e editor) → salvamento automático e versões → aprovação → exportação PNG/JPEG/PDF e pacote ZIP → vitrine, divulgação, vídeos e TV.

| Área | O que existe |
|---|---|
| Contas | Cadastro, login, recuperação de senha, várias contas por usuário, convites, papéis (administrador, editor, aprovador), permissões checadas no servidor, histórico de alterações, exportação e exclusão dos dados da conta |
| Lojas | Várias lojas por conta (limite do plano), identidade visual compartilhada, endereço, contatos, redes, horários, preços por filial |
| Catálogo | Cadastro manual, upload de imagem com origem registrada, importação CSV/XLSX com mapeamento de colunas, colar lista de texto com revisão, atualização de preços em lote com prévia, duplicados, filtros de sem foto/incompleto, custo privado e margem |
| Campanhas | Modo rápido (modelo → produtos → conferir → gerar), editor avançado, 5 mecânicas de preço (simples, de/por, quantidade mínima, combo, clube) + limite por cliente, pagamento e condições, validações, destaques, ordem manual ou por categoria, enquadramento de foto sem distorção, desfazer/refazer, autosave com detecção de conflito, recuperação de rascunho local, histórico e restauração de versões, troca de modelo sem perder dados, duplicação para filiais |
| Aprovação | Rascunho → em revisão → aprovada → agendada → publicada → encerrada. Mudança de produto/preço/condição/data após aprovação exige nova aprovação. Publicação agendada e encerramento rodam no servidor (worker) |
| Modelos | 12 modelos originais e editáveis (supermercado, hortifrúti, açougue, padaria, bebidas, varejo, sazonais), cada um em 9 formatos, com versão fixada por campanha |
| Exportação | PNG/JPEG (300 dpi nos impressos), PDF no tamanho físico (com sangria opcional), pacote ZIP por canal com LEIA-ME, fila com novas tentativas e status |
| Publicação | Vitrine pública por loja (`/loja/<endereço>`) com ofertas por categoria, busca, validade, QR code, lista de interesse para o WhatsApp e pausa de oferta esgotada; campanhas vencidas somem sozinhas; painel Divulgar com link, QR e origem dos acessos |
| Calendário e métricas | Calendário de campanhas com datas comerciais 2026/2027 editáveis (datas móveis calculadas por ano); visualizações da vitrine, cliques no WhatsApp, campanhas e exportações por origem (sem apresentar cliques como vendas) |
| Planos e cobrança | Planos Inicial, Profissional e Redes e Agências com limites configuráveis (lojas, usuários, armazenamento, exportações, IA, vídeo, recursos); cobrança via Stripe **somente em modo de testes**, com webhooks validados e idempotentes, renovação, falha com carência, cancelamento e reembolso; sem Stripe, o plano é ajustado pela administração |
| Administração | Área `/admin` exclusiva: modelos e versões, planos e limites, falhas de exportação, consumo, eventos de assinatura, contas (suspender/reativar) com registro de ações |
| Filiais e equipe | Preços por filial, duplicação para várias filiais com prévia das diferenças, equipe e convites, histórico |
| Vídeos | MP4 vertical e horizontal a partir da campanha, modelos animados, duração ajustável, prévia, fila com status e recuperação; narração opcional (precisa de chave) |
| TV da loja | Player por link ou código de pareamento, playlist, agendamento, atualização remota e funcionamento com conexão instável |
| Modo agência | Várias contas de clientes com identidades e materiais separados, prévia para aprovação por link com validade, sem acesso cruzado; **a agência paga** (os clientes usam o plano dela e contam no limite de lojas) |
| Integrações | API v1 com tokens por conta, perfis de importação de planilhas de sistemas de gestão ([docs/06-integracoes.md](docs/06-integracoes.md)); importação manual continua disponível |
| IA assistida | Extração de listas (texto, foto, PDF), remoção de fundo, sugestões de textos e campanhas, organização de produtos; sempre com revisão humana, consumo por créditos do plano, preços nunca alterados pela IA (precisa de chaves) |
| Página comercial | Landing e páginas de conteúdo para busca, com sitemap, metadados e exemplos reais gerados pelo próprio sistema |

Recursos que dependem de contas externas (Stripe, IA, remoção de fundo, narração, SMTP) aparecem como "não configurado" até as chaves serem cadastradas no servidor, e a alternativa manual continua funcionando. Validação: [docs/05-validacao.md](docs/05-validacao.md).

## Stack

Next.js 16 + TypeScript, PostgreSQL 16 (Drizzle ORM, migrações SQL em `drizzle/`), pg-boss (fila no próprio Postgres), Chromium headless via playwright-core para exportar exatamente o que a prévia mostra, sharp para imagens. Justificativa e contratos em [docs/02-arquitetura.md](docs/02-arquitetura.md).

## Instalação local

Requisitos: Node 22+, PostgreSQL 14+ e Chromium (ou Google Chrome) instalado.

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL, APP_SECRET e CHROMIUM_PATH
createdb encartevarejo
npm run db:migrate
npm run db:seed               # planos, calendário comercial 2026/2027 e conta de demonstração
npm run dev                   # http://localhost:3000
npm run worker                # em outro terminal: exportações e agendamentos
```

O seed imprime a senha da conta `demo@exemplo.com` (gerada a cada execução). Todos os dados dessa conta são fictícios e marcados como **dados de demonstração**.

Sem SMTP configurado, os e-mails (recuperação de senha, convites) ficam em `GET /api/dev/emails` (somente fora de produção).

Para exportar sem o worker durante o desenvolvimento: `EXPORT_INLINE=1 npm run dev`.

Galeria de modelos para conferência visual: `/modelos-amostra?n=12` (desativada em produção, salvo `EV_SHOW_SAMPLES=1`).

## Testes

```bash
npm run typecheck
npm test                      # unidade + integração (usa TEST_DATABASE_URL, recriado a cada execução)
npm run test:e2e              # Playwright (veja playwright.config.ts para a URL e o Chromium)
```

## Variáveis de ambiente

Ver [.env.example](.env.example). Nunca coloque segredos no repositório. `APP_SECRET` assina sessões, URLs privadas de imagens e tokens de renderização: gere com `openssl rand -hex 32`.

## Hospedagem

Nada foi publicado nem contratado. O guia completo, com a opção recomendada (Railway), o custo mensal estimado e o passo a passo, está em [docs/07-hospedagem.md](docs/07-hospedagem.md).

Resumo técnico: o `Dockerfile` gera uma imagem única com a aplicação web, o worker, Chromium e ffmpeg; `scripts/start-production.sh` confere as variáveis obrigatórias, aplica as migrações, cadastra planos e calendário (`npm run db:seed -- --producao`, sem conta de demonstração) e sobe a aplicação e o worker juntos. Basta um PostgreSQL e um volume persistente montado em `/data`.

## Cobrança

Etapa 4 = **cobrança em testes**. Nenhuma cobrança real é feita e nada foi configurado em produção.

**Como funciona**

- Planos: Inicial, Profissional e Redes e Agências, com limites de lojas, usuários, armazenamento, exportações por mês, créditos de IA e minutos de vídeo (sempre finitos). Valores comerciais não estão no código: plano sem preço aparece como "Valor a definir" e não pode ser assinado. Preço (`price_cents`) e id do preço no Stripe (`provider_price_id`) são definidos na administração da plataforma.
- Provedor `manual` (padrão, sem credenciais): a equipe de suporte ajusta plano e situação da conta (`setManualSubscription` em `src/server/services/subscriptions.ts`). Provedor `stripe`: só fica ativo com `STRIPE_SECRET_KEY` de **testes** (`sk_test_`) e `STRIPE_WEBHOOK_SECRET`. Chaves `sk_live_` são recusadas.
- Ciclo da assinatura: **teste** (14 dias, `BILLING_TRIAL_DAYS`) → **ativa** → **inadimplente** (falha de pagamento; carência de 7 dias, `BILLING_GRACE_DAYS`) → **cancelada** (cancelamento agendado para o fim do período pago) → **encerrada**.
- Conta **somente leitura** quando: assinatura encerrada; inadimplente depois da carência; cancelada depois do fim do período; reembolso total; conta suspensa; ou teste vencido *com pagamento online configurado* (sem provedor, o teste vencido não bloqueia e o suporte ativa o plano). Nesse estado as escritas respondem `402` com o código `subscription_inactive`; continuam liberados consultar, exportar e excluir os dados da conta, entrar/sair e a área de cobrança. Um pagamento confirmado depois restaura o acesso.
- Reembolso: total encerra o acesso na hora (o cancelamento da assinatura no Stripe deve ser feito pelo painel do Stripe ou pelo portal); parcial só é registrado.
- Webhooks: assinatura `Stripe-Signature` validada (HMAC-SHA256, tolerância de 5 minutos), idempotentes (um registro por evento em `billing_events`) e seguros fora de ordem (evento mais antigo que o último aplicado é ignorado). Guardamos só resumos sem dados pessoais nem de cartão.
- Tela: **Conta › Plano e cobrança** (`/app/conta/plano`).

**O que o dono precisa fazer para testar com o Stripe (modo de testes)**

1. Criar uma conta no Stripe e deixar o painel em **modo de teste** (chave "Test mode" ligada). Não ative pagamentos reais.
2. Em Produtos, criar um produto por plano (Inicial, Profissional, Redes e Agências) com um **preço recorrente mensal em BRL**. Copiar o id de cada preço (`price_...`).
3. Na administração da plataforma, informar o valor (`price_cents`) e o id do preço (`provider_price_id`) de cada plano.
4. Em Desenvolvedores › Chaves de API, copiar a chave secreta de teste (`sk_test_...`) para `STRIPE_SECRET_KEY` no `.env` do servidor (nunca no repositório).
5. Cadastrar o webhook apontando para `https://SEU_DOMINIO/api/billing/webhook/stripe` com os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` e `charge.refunded`; copiar o segredo (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`. Em ambiente local, use o Stripe CLI: `stripe listen --forward-to localhost:3000/api/billing/webhook/stripe` (ele mostra o `whsec_` a usar).
6. Ativar o portal do cliente em Configurações › Faturamento › Portal do cliente (para "Gerenciar pagamento" e troca de plano).
7. Reiniciar a aplicação e testar com os cartões de teste do Stripe (ex.: `4242 4242 4242 4242` aprovado; `4000 0000 0000 0341` falha na renovação), ou disparar eventos com `stripe trigger invoice.payment_failed`.

**Verificação feita até aqui:** os testes automatizados (`tests/server/billing.test.ts`) usam eventos assinados localmente com o mesmo algoritmo do Stripe e uma API simulada. A integração **ainda não foi testada contra os servidores do Stripe**, porque não há credenciais de teste; esse é o passo 7 acima.

## IA assistida

Recursos (todos com revisão humana; nada é salvo sem confirmação):

- **Extração de listas** (Produtos › Colar lista › *Extrair com IA*; atalho na importação): texto colado, foto de lista escrita à mão ou impressa, tabela de preços ou PDF (até 5 páginas, 8 MB). Volta uma tela de revisão linha a linha com confiança por campo e comparação com o catálogo (atualizar o existente ou criar outro); só as linhas marcadas "Confirmo" são salvas. Campos ausentes na fonte ficam vazios. Para texto, todo preço precisa aparecer literalmente no texto colado (senão é removido e sinalizado), e marca, tamanho, unidade e condições que não estão no texto são removidos; para foto/PDF todos os preços ficam marcados "conferir".
- **Remoção de fundo** (formulário do produto › *Remover fundo*): cria um arquivo **novo** (origem `ia_remocao_fundo`, `parent_asset_id` = original); a foto original nunca é alterada nem apagada. O usuário compara e escolhe. Nenhuma imagem de produto é gerada.
- **Sugestões de textos** (editor › Ações › *Sugestões da IA*): título, subtítulo, descrições curtas e legenda para WhatsApp/Instagram a partir dos dados da campanha. O modelo não recebe nem escreve preços: usa marcadores que o sistema troca pela oferta salva (formatada por `src/domain/money.ts`); qualquer outro valor em R$ é removido e sinalizado.
- **Sugestões de campanhas** (`/app/ia`): temas e janelas de datas a partir do calendário comercial e do catálogo, com produtos já cadastrados e sem preços. *Criar rascunho* cria a campanha com os preços do catálogo.
- **Organização dos produtos** (editor › *Sugestões da IA* › Organizar): destaques = 2–3 maiores descontos calculados dos preços reais, ordem por categoria, categoria do catálogo; a IA só sugere nomes de categoria para itens sem categoria. Cada mudança é aceita separadamente (o desfazer do editor vale).

**Consumo e custos.** Cada pedido consome créditos do plano (`aiCreditsPerMonth`; 0 = não incluído): lista em texto 1, foto 2, PDF 3, remoção de fundo 1, textos 1, campanhas 1, categorias 1 (ajustável em `AI_CREDITS`). Pedidos que falham não consomem créditos. Todo pedido fica registrado em `ai_requests` (tipo, situação, modelo, créditos, resumo da entrada sem o conteúdo, resultado) e aparece em `/app/ia`. Há limite de frequência por conta (`AI_RATE_PER_MINUTE`). O custo real em dinheiro depende do contrato com cada provedor: defina os créditos dos planos de acordo.

**Sem chave configurada**, cada recurso aparece como "não configurado" e o caminho manual (Ler lista, importação de planilha, editar textos à mão) continua igual.

**O que o dono precisa providenciar**

1. Conta na Anthropic (console.anthropic.com) com faturamento e uma chave de API → `ANTHROPIC_API_KEY`. Modelo padrão `claude-sonnet-5-5` (troque com `AI_MODEL`). Para esse modelo o sistema ativa o *fallback* do servidor da Anthropic (`AI_SERVER_FALLBACK=0` desliga): se o classificador de segurança recusar um pedido, ele é refeito em outro modelo da Anthropic.
2. Conta no remove.bg (ou outro provedor, implementando a interface `BackgroundRemover` em `src/server/ai/background.ts`) com créditos de API → `REMOVEBG_API_KEY`.
3. Definir os créditos de IA de cada plano na administração da plataforma.

**Verificação feita até aqui:** os testes (`tests/server/ai.test.ts`) usam um provedor HTTP falso. **As integrações ainda não foram testadas contra as APIs reais da Anthropic e do remove.bg**, porque não há chaves neste ambiente.

## TV da loja

Recurso de plano `tv` (Profissional e Redes). Gestão em **/app/tv**; player em **/tv**.

- **Telas**: cada tela pertence a uma loja, tem orientação (horizontal 1920×1080 → formato `tv_horizontal`; vertical → `story`) e segundos por slide. O status online vem do último contato do aparelho (`lastSeenAt`, a cada ~45 s).
- **Pareamento**: a gestão mostra um código de 6 caracteres (sem letras ambíguas, vale 15 min, uso único). Na TV, abra `/tv` e digite com o controle remoto (setas + OK) ou teclado. `POST /api/tv/pair` tem limite de 10 tentativas a cada 10 min por IP.
- **Player por link**: para TVs sem teclado, “Gerar link do player” cria `/tv/l/<token>` (mostrado uma vez). Uma tela tem um único acesso: gerar link ou parear de novo substitui o anterior; “Desconectar aparelho” revoga (para na próxima sincronização). Só o hash do token fica no banco.
- **Programação**: campanhas publicadas/agendadas da loja (cada página da peça = um slide, renderizada pelo mesmo `PieceRenderer` da exportação) e vídeos concluídos da versão publicada. Ordem por botões, duração por item e agendamento por datas, dias da semana e faixas de horário (`08:00-12:00,17:00-21:00`), sempre no horário de Brasília.
- **O que o aparelho recebe** (`GET /api/tv/playlist`, `Authorization: Bearer <token>`, com `ETag`/`If-None-Match`): só campanhas com status `publicada`, do instantâneo publicado e dentro da validade; itens pausados somem. Vídeos vêm por `/api/tv/media/<id>?t=` (URL assinada pela tela, com `Range`).
- **Conexão instável**: o player guarda a última programação boa no aparelho, guarda imagens e vídeos em cache (service worker `public/tv-sw.js`, escopo `/tv`), tenta de novo com espera exponencial e mostra “Sem conexão desde HH:MM”. Agendamento e validade são avaliados no próprio aparelho: oferta vencida sai mesmo offline. Mudanças entram na próxima troca de slide, sem tela preta. Abrir o player offline (recarregar a página sem internet) exige HTTPS (service worker).

## Vídeos de ofertas

Botão **Vídeo** no editor da campanha (permissão `exports.create`). Gera MP4 H.264 (yuv420p, *faststart*) vertical 1080×1920 (Stories/Reels/Status) ou horizontal 1920×1080 (TV), 30 quadros/s, com a mesma identidade visual do modelo da campanha.

- **Opções**: formato; animação (Deslizar, Zoom, Cortina, Subir); duração 15/30/45/60 s ou automática (máx. 60 s; destaques entram primeiro e o sistema avisa quais produtos ficaram de fora); áudio “Sem áudio”, “Trilha gerada pelo sistema” (sintetizada com ffmpeg, sem direitos de terceiros) ou “Áudio próprio” (upload de até 15 MB com confirmação obrigatória de licença); narração opcional (texto gerado dos dados, com preços por extenso, editável antes de gerar).
- **Prévia** ao vivo na própria janela (play/pausa e barra de tempo); cada preço fica parado e legível por pelo menos 1,5 s.
- **Fila** pg-boss `video`: `na_fila → processando → concluida | falhou`, com progresso. Até 2 novas tentativas automáticas com espera crescente; vídeos presos em `processando` (worker caiu) são recuperados ao iniciar o worker e a cada minuto. O consumo (`video_second`) é conferido antes de enfileirar (contando os vídeos ainda na fila) e registrado só quando o vídeo fica pronto.
- **Requisitos do servidor do worker**: **ffmpeg 6+ com libx264 e aac** (e `ffprobe`) no PATH (ou `FFMPEG_PATH`/`FFPROBE_PATH`), Chromium do playwright (o mesmo da exportação) e `npm run worker` rodando. Um vídeo de 15 s em 1080×1920 leva ~50 s numa CPU comum.
- **Variáveis**: `VIDEO_INLINE=1` (desenvolvimento: gera num processo filho sem worker; cai para `EXPORT_INLINE`), `VIDEO_FPS` (30 ou 25), `VIDEO_CONCURRENCY` (padrão 1), `VIDEO_X264_PRESET` (padrão `medium`), `FFMPEG_PATH`, `FFPROBE_PATH`.
- **Narração (opcional)**: provedor Google Cloud Text-to-Speech (REST `text:synthesize`). Configure `GOOGLE_TTS_API_KEY` (chave de API com a Text-to-Speech API ativada) e, se quiser, `GOOGLE_TTS_VOICE` (padrão `pt-BR-Neural2-A`), `GOOGLE_TTS_ENDPOINT` e `VIDEO_TTS_PROVIDER` (`google` | `none`). Sem chave, a opção aparece como “não configurado”. **A integração ainda não foi testada contra a API real do Google** (não há chave neste ambiente); os testes usam um provedor falso.
- Os planos precisam de minutos de vídeo (`videoMinutesPerMonth`); plano sem minutos mostra a mensagem para trocar de plano.

## Backup e recuperação

- Banco: `pg_dump -Fc "$DATABASE_URL" > backup.dump`; restaurar com `pg_restore -d <novo_banco> backup.dump` e depois `npm run db:migrate`.
- Arquivos: copie a pasta `STORAGE_DIR` (ou habilite versionamento no bucket S3).
- Teste a restauração periodicamente em um banco separado.

## Estrutura

```
src/domain/       regras puras: dinheiro em centavos, ofertas, formatos, campanhas, permissões
src/server/       autenticação, serviços por área, exportação, armazenamento, banco (schema.ts)
src/app/api/      rotas HTTP (JSON, erros em português)
src/app/(app)/    painel e editor
src/layout/       motor de layout e paginação
src/templates/    12 modelos (uma pasta por modelo, versionados) e peças compartilhadas
src/render/       componente único de renderização usado na prévia e na exportação
src/worker/       fila de exportação e agendador
drizzle/          migrações SQL
docs/             pesquisa, arquitetura, design e validação
```

## Pendências e dependências externas

Dependem de decisão ou conta do dono:

- **Hospedagem**: criar a conta e autorizar a publicação ([docs/07-hospedagem.md](docs/07-hospedagem.md)). Depois, dar acesso de administração da plataforma com `npm run admin:grant -- <email>`.
- **Valores dos planos**: ainda "a definir"; são cadastrados na administração (`/admin`).
- **Cobrança real**: hoje só modo de testes. Precisa de conta Stripe, um preço mensal por plano e, para cobrar de verdade, autorização expressa, chaves de produção e `BILLING_ALLOW_LIVE=1`.
- **E-mail**: conta de envio (SMTP), sem a qual recuperação de senha e convites não chegam em produção.
- **Serviços opcionais**: chave da Anthropic (IA), remove.bg (remoção de fundo) e Google Text-to-Speech (narração). Sem elas, os recursos aparecem como "não configurado".
- **Textos legais**: termos de uso e política de privacidade (LGPD) não fazem parte deste código.

Limitações conhecidas:

- Busca de produto por código de barras exige uma fonte de dados real; hoje o código de barras é só um campo do cadastro e da API.
- Arquivos para gráfica saem em RGB, sem conversão CMYK, e isso é informado no pacote.
- Publicação automática em redes sociais e envio em massa no WhatsApp não existem: dependem de APIs oficiais e autorização.
- Arquivos ficam em disco (volume). Para várias instâncias da aplicação, trocar o adaptador de `src/server/storage.ts` por S3 compatível.
- Os serviços externos (Stripe, Anthropic, remove.bg, Google) foram testados com simulações automáticas, não com contas reais.

## Próxima etapa priorizada

1. Publicar uma prévia privada na hospedagem recomendada, com Stripe em modo de testes e SMTP, e testar com 1 ou 2 lojas reais.
2. Definir os valores dos planos e os limites de IA e vídeo com base no consumo medido nessa prévia.
3. Termos de uso, política de privacidade e página de contato.
4. Ativar a cobrança real, com autorização do dono.
5. Melhorias a partir do uso: busca por código de barras com fonte autorizada, armazenamento S3, publicação em redes sociais por API oficial.
