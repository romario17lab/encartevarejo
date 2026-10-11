# 05 — Validação dos critérios de aceitação

Dono: Agente de Qualidade. Data: 11/10/2026. Ambiente: build de produção (`next start`, porta 3105) + worker real
(pg-boss, `EXPORT_INLINE` desligado) + banco `ev_qa` recriado do zero (migrações + seed). Chromium
`/opt/pw-browsers/chromium-1194`. Evidências visuais em `/mnt/project-files/encartevarejo/validacao/`.

## Como rodar

```bash
# 1. banco e servidores
psql -h 127.0.0.1 -U postgres -c "drop database if exists ev_qa" -c "create database ev_qa"
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/ev_qa APP_URL=http://localhost:3105 \
       RENDER_BASE_URL=http://localhost:3105 TRUST_PROXY=1 APP_SECRET=<segredo> STORAGE_DIR=<pasta>
npx tsx src/server/db/migrate.ts && npx tsx src/server/db/seed.ts
npx next start -p 3105 &            # build de produção já existente em .next
npx tsx src/worker/index.ts &       # anote o PID do grupo em um arquivo (QA_WORKER_PIDFILE)

# 2. testes de API / renderização / exportação (caixa-preta contra o servidor real)
QA_BASE_URL=http://localhost:3105 QA_WORKER_PIDFILE=<arquivo-pid> QA_LOG_DIR=<pasta> \
  npx vitest run -c tests/qa/vitest.config.ts          # 27 aprovados (D-01 e D-03 corrigidos viraram testes de regressão)

# 3. testes de interface (390 px e 1280 px)
QA_BASE_URL=http://localhost:3105 npx playwright test -c e2e/qa/playwright.config.ts
# 6 aprovados (390 px e 1280 px), incluindo a verificação do aviso de reaprovação (D-02 corrigido)
```

`tests/qa/falhas-externas.test.ts` para o worker principal, sobe um worker com Chromium inexistente e depois
reinicia o worker normal; também sobe um segundo `next start` (porta 3197) apontando para um banco inexistente.

## Resultado por critério

| # | Critério | Situação | Evidência |
|---|---|---|---|
| 1 | Loja cria, salva, reabre e edita campanha (390 px e desktop) | **Aprovado** | `e2e/qa/editor-fluxos.spec.ts` (projetos `celular-390` e `desktop-1280`): assistente → editor → preço editado → salvamento automático → reabrir pela lista → preço mantido. Telas `validacao/telas/qa-01…qa-05-*-390.png` e `*-1280.png` |
| 2 | Preços corretos em todos os materiais | **Aprovado** | `tests/qa/exportacao-precos.test.ts`: render-data = preços gravados; nos 9 formatos cada `[data-ev-price]` tem `aria-label` = `describeOffer(oferta gravada)` e o texto visível contém o valor (12 produtos, 5 mecânicas); pacote ZIP: texto dos 4 PDFs contém todos os preços; PNG conferidos visualmente (`validacao/exportacao/00-pacote.png`); mudar preço depois gera arquivo novo só com o novo preço. Relatório: `validacao/exportacao/relatorio.txt` |
| 3 | 1, 12 e 40 produtos nos 9 formatos | **Aprovado** (D-01 corrigido) | `tests/qa/composicao.test.ts`: medição na página `/render` real — card dentro da página, sem sobreposição, preço dentro do card e sem corte, nome sem cobrir o preço, selos dentro da página; todos os produtos presentes no encarte/cartazes/etiquetas. 0 problemas exceto D-01. Folhas: `validacao/composicao/00-1-produto.png`, `00-12-produtos.png`, `00-40-produtos.png`; relatório `composicao/relatorio.txt` |
| 4 | Nomes longos não quebram a composição | **Aprovado** | `composicao.test.ts › nomes longos` (6 produtos com nome de ~110 caracteres): reduz e corta com reticências em 2–3 linhas, sem invadir preço/foto. `validacao/composicao/00-nomes-longos.png` |
| 5 | Fotos com proporções diferentes sem distorção | **Aprovado** | `composicao.test.ts › fotos`: foto 1600×400 (4:1) e 300×1200 (1:4) reais (sharp, com círculo); em todos os formatos `object-fit: contain` ⇒ proporção desenhada = natural (4,000 / 0,250). Etiquetas não usam foto (por desenho). `validacao/composicao/fotos_*.png` |
| 6 | PNG e PDF abrem e batem com a prévia | **Aprovado** | PNG exportado × página de render: 0,000 % de pixels diferentes; PDF rasterizado (pdftoppm 96 dpi) × render: erro médio 3,9/255; prévia do **editor** (504 px, escala reduzida) × PNG exportado reduzido: erro médio 1,7/255 (`e2e/qa/editor-fluxos.spec.ts`). PDFs: A4/A3, nº de páginas = nº de páginas do layout (`pdfinfo`). Imagens: `validacao/telas/00-previa-x-png.png`, `validacao/exportacao/comparacao_*.png` |
| 7 | Exportação em lote pelo worker; estados; download | **Aprovado** | `exportacao-precos.test.ts › pacote`: `na_fila → processando → concluida`, versão fixada, ZIP com pastas 01-encarte…06-tv + LEIA-ME, download só com sessão (401 sem login), `Content-Disposition: attachment`. Também pela interface (diálogo Exportar). `validacao/exportacao/pacote.zip` |
| 8 | Fluxo em ~390 px | **Aprovado** | `e2e/qa/telas-390.spec.ts` + `editor-fluxos.spec.ts`: 17 telas + 5 abas do editor + diálogos sem rolagem horizontal e com todos os controles dentro da largura; "Exportar arquivos" sempre visível no editor. Folha `validacao/telas/00-telas-390.png` (as barras fixas aparecem no meio de algumas capturas de página inteira — efeito da captura, não da tela) |
| 9 | Uma conta não acessa dados privados de outra | **Aprovado** | `tests/qa/isolamento.test.ts` (2 contas reais via HTTP): GET/PATCH/DELETE de produtos, campanhas (+16 subrotas: versões, restaurar, modelo, duplicar, ações, exportações, render-data), assets (sessão e URL assinada com org trocada), exportações e download, membros, lojas, identidade, auditoria, troca de conta ativa → 404/negado; `/render` com token de outra campanha, token forjado com org errada, sem token e adulterado → página de erro sem dados. Custo nunca aparece em render-data/vitrine/render |
| 10 | Ofertas vencidas saem da vitrine | **Aprovado** | `tests/qa/fluxo-aprovacao-vitrine.test.ts`: datas alteradas no banco → vitrine já filtra pelo instantâneo; `runCampaignScheduler` encerra; só a linha vencida → agendador encerra e some; agendamento publica no horário; item pausado some na hora |
| 11 | Mudança relevante invalida a aprovação | **Aprovado** (D-02 corrigido) | API: aprovar → publicar → mudar preço ⇒ `rascunho`, `approvedHash/approvedBy` nulos, `publishedVersion` mantida, vitrine segue com o preço antigo, publicar sem reaprovar = 409; título não invalida; datas invalidam; reaprovar + republicar mostra o preço novo. Interface: mesmo fluxo em `editor-fluxos.spec.ts` (390 e desktop), mas sem aviso na tela — ver D-02. `validacao/telas/qa-08-reaprovacao-*.png` |
| 12 | Projetos antigos mantêm a versão do modelo | **Aprovado** | `tests/qa/versao-modelo.test.ts`: v2 falsa registrada só na memória do teste ⇒ campanha antiga continua v1 em render-data, editor (`latestVersion: 2`) e após salvar; campanha nova pega v2; troca explícita sobe/desce. No servidor real: campanha fixada em v7 (inexistente) não vira v1 em silêncio — `/render` mostra "Modelo feira-da-semana v7 não está disponível" e a exportação devolve 422 |
| 13 | Falhas externas tratadas com clareza | **Aprovado** (D-04 corrigido) | `tests/qa/falhas-externas.test.ts`: worker com `CHROMIUM_PATH` inválido ⇒ 3 tentativas e `falhou` com "Não foi possível gerar os arquivos. Tente novamente em alguns minutos." (sem detalhe técnico); banco fora ⇒ `500 {"error":{"code":"internal","message":"Erro inesperado. Tente novamente em instantes."}}`; sem SMTP ⇒ e-mail de recuperação na `email_outbox`, resposta idêntica para e-mail inexistente |

### Fluxos extras exercitados na interface (390 px e desktop)

| Fluxo | Situação | Onde |
|---|---|---|
| Enviar para revisão, reprovar (com motivo), aprovar, agendar (data/hora), publicar, tirar da vitrine, republicar, encerrar | Aprovado (estado conferido na API e na vitrine a cada passo) | `editor-fluxos.spec.ts` |
| Trocar modelo (preços preservados) | Aprovado | `editor-fluxos.spec.ts`, `qa-05-modelo-trocado-*.png` |
| Restaurar versão (cria versão nova, volta preço e modelo da versão 1) | Aprovado | `editor-fluxos.spec.ts`, `qa-06-versoes-*.png` |
| "Mover para a posição" | Aprovado (ordem salva) | `editor-fluxos.spec.ts` |
| Enquadramento da foto (posição horizontal 80 %, zoom 1,5×) | Aprovado (`imageFit` salvo) | `editor-fluxos.spec.ts` |
| Convite → aceite por pessoa nova → troca de papel (editor → aprovador); aprovador não muda papéis (403) | Aprovado | `e2e/qa/conta-equipe.spec.ts` |
| Recuperação de senha pelo link do e-mail; link de uso único; sessões antigas encerradas | Aprovado (em produção `/api/dev/emails` = 404; link lido da caixa de saída) | `conta-equipe.spec.ts` |
| Exportação dos dados da conta (JSON sem hash de senha) | Aprovado | `conta-equipe.spec.ts` |

## Defeitos

| ID | Gravidade | Defeito | Onde | Reprodução | Esperado × obtido | Situação |
|---|---|---|---|---|---|---|
| D-03 | **Alta** | O endereço da vitrine impresso em **todas** as peças (`APP_URL/loja/<slug>`) não existe: 404 | `src/server/services/render-data.ts:291` gera o link; não há `src/app/loja/[slug]/page.tsx` (só a API `/api/storefront/[slug]`) | Exportar qualquer peça; abrir o endereço do rodapé (`curl localhost:3105/loja/<slug>` → 404). Teste `fluxo-aprovacao-vitrine.test.ts › D-03` (falha esperada) | Página pública da vitrine × 404 para o cliente final | **Corrigido** (11/10/2026): página pública `src/app/loja/[slug]/page.tsx` (+ `src/components/storefront/StorefrontView.tsx`): ofertas publicadas por categoria, busca, lista de interesse via WhatsApp (pedido, sem pagamento), QR code SVG, metadados/OpenGraph, estado vazio, 404 para loja desconhecida/desativada; eventos `view` (na página) e `whatsapp_click`/`share` (`POST /api/storefront/[slug]/event`, origem por `?utm_source`/`?origem`, limite leve). Testes: `tests/server/storefront-page.test.ts`, `fluxo-aprovacao-vitrine.test.ts › D-03` |
| D-04 | Média | Com `SMTP_URL` definido nenhum e-mail é enviado (só fica na caixa de saída); em produção `/api/dev/emails` é desligado, então recuperação de senha e convites não chegam a ninguém | `src/server/email.ts:7-9,30-32` (diz que o adaptador não está instalado, mas `nodemailer` já está em `package.json`) | Definir `SMTP_URL`, pedir "Esqueci minha senha" | E-mail entregue × só registro em `email_outbox` + aviso no log | **Corrigido**: com `SMTP_URL` o envio é feito por nodemailer em segundo plano após o registro confirmado na `email_outbox` (status `enviado`/`falhou`; log só com id/tipo/código de erro); sem `SMTP_URL` fica só na caixa de saída. Testes: `tests/server/email.test.ts` (transporte simulado + servidor SMTP local) |
| D-02 | Média | Depois de editar preço/datas de campanha aprovada/agendada/publicada, a tela mostra só "Rascunho": nenhum aviso de que a aprovação caiu nem de que a vitrine continua com a versão publicada | `src/components/editor/WorkflowBar.tsx:36-37,72-74` dependem de `approvedVersion/approvedHash`, que o servidor zera em `src/server/services/campaigns.ts:336`; logo `needsReapproval` (`campaigns.ts:49`) é sempre falso após a reversão | Publicar; editar um preço; aguardar "Salvo às" | Aviso "é preciso aprovar de novo; a vitrine mostra a versão N" × nada. Sugestão: usar `publishedVersion != null && status ∈ {rascunho, em_revisao}` ou guardar o hash revogado | **Corrigido**: `needsReapproval` derivado de `publishedVersion` mantida + status `rascunho`/`em_revisao` (sem migração); `WorkflowBar` mostra "Esta campanha foi alterada depois da aprovação. A vitrine continua mostrando a versão N publicada até uma nova aprovação." Testes: `tests/server/campaigns.test.ts › D-02`, `editor-fluxos.spec.ts` (verificação soft agora passa) |
| D-01 | Baixa | Nome do clube cortado com reticências em layout denso ("CLUBE VANTAGE…") | `src/templates/parts/PriceTag.tsx:180` (`fitOneLine` com `minFs: 6`) + `:222` (`textOverflow: "ellipsis"`) | Campanha com 40 produtos, mecânica clube "Clube Vantagens", encarte A4 págs. 2–3. Teste `composicao.test.ts › D-01`; imagem `validacao/composicao/defeito-clube-reticencias.png` | Nome do clube inteiro (ou aviso no painel) × cortado. Preço e "Preço normal" corretos | **Corrigido**: nome do clube cabe em 1 linha (medida com espaçamento e margens), senão quebra em 2 linhas equilibradas, senão vira "Clube" (nome completo segue no `aria-label`); sem reticências, preço intacto. `check-overflow.ts`: 756 renderizações, 0 problemas. Testes: `tests/server/price-tag-club.test.tsx`, `composicao.test.ts › D-01` |

### Observações (sem defeito)

- PDFs A4/A3 saem com 595,92 × 841,92 pt (210,2 mm) em vez de 595,28 pt: diferença de 0,2 mm, reconhecido como A4 pelo `pdfinfo`.
- Nomes longos são cortados com reticências; variações que só diferem no fim do nome (ex.: "… 1", "… 2") ficam iguais na peça. O motor emite o aviso `long_name_truncated` (comportamento documentado).
- Fotos muito largas (4:1) ficam como uma faixa fina em cards quase quadrados — sem distorção, mas pouco legíveis; vale um aviso de "foto muito larga" no editor.
- O toast fica por cima da prévia por ~4,5 s após cada ação (afeta só capturas de tela).

## Arquivos de teste

- `tests/qa/vitest.config.ts`, `helpers.ts`, `fixtures.ts`, `render-inspect.ts`, `montage.ts`
- `tests/qa/isolamento.test.ts` (9), `fluxo-aprovacao-vitrine.test.ts` (10, 11, D-03), `versao-modelo.test.ts` (12),
  `composicao.test.ts` (3, 4, 5, D-01), `exportacao-precos.test.ts` (2, 6, 7), `falhas-externas.test.ts` (13)
- `e2e/qa/playwright.config.ts`, `util.ts`, `editor-fluxos.spec.ts` (1, 6, 8, 11, fluxos extras, D-02),
  `conta-equipe.spec.ts` (convite, papéis, senha, exportação de dados), `telas-390.spec.ts` (8)
