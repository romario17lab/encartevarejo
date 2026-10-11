# EncarteVarejo — Arquitetura, contratos e responsabilidades

## Stack (e por quê)

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | TypeScript em tudo | Um só modelo de tipos para dados de campanha, modelos e API |
| Web + API | Next.js 16 (App Router) + Route Handlers | Frontend responsivo e backend no mesmo deploy; sem microserviços |
| Banco | PostgreSQL 16 + Drizzle ORM (migrações SQL em `drizzle/`) | Relacional, transações, JSONB para instantâneos; Drizzle é JS puro, migrações legíveis |
| Fila | pg-boss (fila dentro do Postgres) | Exportações, vídeos, publicação agendada e encerramento rodando no servidor, sem Redis |
| Renderização | Componentes React → HTML; exportação com Chromium headless (playwright-core) | A prévia do editor e o arquivo exportado usam o MESMO componente: fidelidade |
| Imagens | sharp | Validação real do arquivo, redimensionamento, sem distorção |
| Arquivos | Pasta local (`STORAGE_DIR`) com interface `Storage` | Troca por S3 compatível em produção sem mudar o resto |
| Testes | Vitest (unidade e integração com Postgres real) + Playwright (fluxos e 390 px) | |

Processos: `web` (Next.js) e `worker` (pg-boss: exportações, agendamentos). Ambos usam o mesmo banco.

## Regras invioláveis

1. Dinheiro sempre em **centavos inteiros** (`src/domain/money.ts`). Nunca float.
2. Toda tabela de cliente tem `org_id`; **toda** consulta filtra por `ctx.orgId` vindo da sessão no servidor, nunca do corpo da requisição.
3. Permissões verificadas no servidor com `can(role, permission)` (`src/domain/campaign.ts`).
4. `cost_cents` (custo) nunca sai do servidor fora das telas privadas de catálogo; nunca entra em `RenderCampaign`, vitrine ou exportação.
5. Textos, preços e condições são renderizados a partir de dados estruturados. Nada de preço desenhado por IA.
6. Nenhum preço anterior, unidade, marca ou produto é inventado; campos ausentes ficam ausentes e geram aviso.
7. Campanha guarda `templateId + templateVersion`. Modelo novo = nova versão; a antiga continua no registro.
8. Mudança em produtos, preços, condições ou datas após aprovação muda `contentHash` → exige nova aprovação. A vitrine mostra apenas o instantâneo publicado (`publishedVersion`).
9. Segredos só em variáveis de ambiente do servidor. Logs sem senha, token, cookie ou custo.
10. Interface em pt-BR, valores em R$, funcional em 390 px.

## Contratos compartilhados (já escritos — alterar só via coordenador)

- `src/domain/money.ts` — centavos, `parseBRL`, `formatBRL`, `priceParts`, `discountPercent`, `marginBasisPoints`
- `src/domain/offer.ts` — unidades, mecânicas de preço (`simple`, `from_to`, `min_qty`, `combo`, `club`), `validateOffer`, `describeOffer`
- `src/domain/formats.ts` — 9 formatos (encarte A4, post quadrado, feed, story, cartaz A4/A3, etiquetas, banner vitrine, TV)
- `src/domain/campaign.ts` — estados, papéis, permissões, `CampaignItem`, `RenderCampaign`, `PieceOverrides`
- `src/templates/contract.ts` — `TemplateDefinition`, `LayoutFn`, `PageLayout`, `LayoutCell`, avisos
- `src/server/db/schema.ts` — esquema do banco
- `src/server/{errors,context,signing,storage,ids}.ts`
- `src/components/ui/index.tsx` — componentes base (Button, Input, PriceInput, Select, Textarea, Card, Badge, Dialog, Tabs, EmptyState, ErrorState, Spinner, toast/Toaster)

## API HTTP (JSON; erros: `{ error: { code, message } }` com mensagem em português)

Autenticação por cookie `ev_session` (httpOnly, SameSite=Lax, Secure em produção).

**Auth e conta**
- `POST /api/auth/signup` `{name,email,password,orgName,storeName,segment}` → cria usuário, conta (plano inicial), identidade visual, 1ª loja, vínculo admin, sessão
- `POST /api/auth/login` `{email,password}` · `POST /api/auth/logout`
- `POST /api/auth/forgot` `{email}` (resposta sempre igual) · `POST /api/auth/reset` `{token,password}`
- `GET /api/me` → `{ user, org, role, orgs:[{id,name,role}], stores:[...], permissions:[...] }`
- `POST /api/me/active-org` `{orgId}`
- `GET /api/org` · `PATCH /api/org` `{name, settings}` · `GET /api/org/export` (exportação dos dados da conta, JSON) · `DELETE /api/org` (exclusão com confirmação)
- `GET /api/members` · `PATCH /api/members/:userId` `{role, storeIds}` · `DELETE /api/members/:userId`
- `GET /api/invitations` · `POST /api/invitations` `{email, role}` · `DELETE /api/invitations/:id` · `POST /api/invitations/accept` `{token}` (+ signup se novo)
- `GET /api/audit?entityType=&entityId=&cursor=`

**Identidade e lojas**
- `GET /api/brand-kits` · `PATCH /api/brand-kits/:id` `{name, logoAssetId, colors, slogan, legalText}`
- `GET /api/stores` · `POST /api/stores` · `GET/PATCH/DELETE /api/stores/:id`

**Arquivos**
- `POST /api/assets` (multipart: `file`, `source`, `sourceNote`) → `{ id, url, width, height }` — JPEG/PNG/WebP validados pelo conteúdo, até 8 MB, normalizados por sharp
- `GET /api/assets/:id` (sessão da mesma conta) ou `GET /api/assets/:id?t=<token assinado>` (renderização/exportação)

**Catálogo**
- `GET /api/products?q=&category=&issues=sem_imagem|incompleto&cursor=` · `POST /api/products` · `PATCH /api/products/:id` · `DELETE /api/products/:id` (arquiva)
- `POST /api/products/import/preview` (multipart CSV/XLSX) → `{ columns, sampleRows, suggestedMapping, totalRows, importId }`
- `POST /api/products/import/commit` `{ importId, mapping, options:{ onDuplicate: "skip"|"update"|"create" } }` → `{ created, updated, skipped, errors:[{row,message}] }`
- `POST /api/products/parse-text` `{ text }` → `{ rows:[{ line, name, sizeLabel, unit, priceCents, issues[] }] }` (parser determinístico, revisão humana obrigatória)
- `POST /api/products/bulk-price/preview` `{ changes:[{productId, regularCents?, promoCents?}] }` → diff · `POST /api/products/bulk-price/commit`
- `GET /api/products/duplicates` → grupos de prováveis duplicados

**Campanhas**
- `GET /api/campaigns?status=&storeId=&from=&to=` · `POST /api/campaigns` `{storeId,name,templateId,startsAt,endsAt,productIds?}`
- `GET /api/campaigns/:id` → `EditorState` `{ campaign, items, pieces, template:{id,version,name,latestVersion}, issues, store }`
- `PUT /api/campaigns/:id` `{ baseVersion, campaign:{...}, items:[...], pieces:[...] }` → salva (autosave); 409 se `baseVersion` desatualizada; cria entrada em `campaign_versions` quando o conteúdo muda
- `POST /api/campaigns/:id/duplicate` `{ storeIds?: string[], name? }`
- `GET /api/campaigns/:id/versions` · `POST /api/campaigns/:id/versions/:v/restore`
- `POST /api/campaigns/:id/template` `{ templateId, templateVersion? }` (troca de modelo sem perder dados)
- `POST /api/campaigns/:id/{submit|approve|reject|publish|schedule|unpublish|end}`
- `GET /api/campaigns/:id/render-data` → `RenderCampaign` (URLs de imagem assinadas, SEM custo)

**Exportações**
- `POST /api/campaigns/:id/exports` `{ kind:"single"|"package", items:[{format,fileType}], bleed? }` → job
- `GET /api/exports?campaignId=` · `GET /api/exports/:id` · `GET /api/exports/:id/download`

**Modelos**
- `GET /api/templates` → modelos publicados (última versão) com metadados

## Renderização (prévia = exportação)

```
RenderCampaign + TemplateDefinition + FormatSpec + PieceOverrides
   └─ layoutPiece()  (src/layout/engine.ts)  → PageLayout[] + avisos
        └─ <PieceRenderer page=... /> (src/render/PieceRenderer.tsx) → template.renderPage()
              ├─ Editor: dentro de um contêiner com transform: scale()
              └─ Exportação: /render/[campaignId]?f=&p=&t=<token> aberto no Chromium → PNG/JPEG/PDF
```

## Responsabilidade por arquivos (agentes)

| Agente | É dono de | Não altera |
|---|---|---|
| Backend | `src/server/**` (exceto `export/`, `services/render-data.ts`, `storage.ts`, `signing.ts`), `src/app/api/**` (exceto `exports/**` e `campaigns/[id]/exports/**`, `campaigns/[id]/render-data/**`), `drizzle/**`, `tests/server/**`, `src/proxy.ts` | contratos `src/domain/**` |
| Design | `src/templates/**` (exceto `contract.ts`), `src/render/fonts.css`, `src/components/ui/**` (visual, sem quebrar API), `tailwind.config.ts`, `src/app/globals.css`, `docs/03-design.md` | |
| Geração | `src/layout/**`, `src/render/**` (exceto `fonts.css`), `src/app/render/**`, `src/server/export/**`, `src/server/services/render-data.ts`, `src/worker/**`, `src/app/api/exports/**`, `src/app/api/campaigns/[id]/exports/**`, `src/app/api/campaigns/[id]/render-data/**`, `tests/generation/**` | |
| Frontend | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/(auth)/**`, `src/app/(app)/**`, `src/components/app/**`, `src/components/editor/**`, `src/lib/client/**`, `e2e/**` | |
| Qualidade | `tests/qa/**`, `e2e/qa/**`, `docs/05-validacao.md` | código de produção (relata defeitos) |
| Coordenador | `src/domain/**`, `src/templates/contract.ts`, `docs/02-arquitetura.md`, `package.json`, `README.md` | |

Pedidos de mudança em contrato: o agente descreve no relatório final; o coordenador aplica.

## Regras de negócio implementadas (Etapa 2)

- **contentHash** (exige nova aprovação quando muda): nome, marca, tamanho, unidade e oferta completa de cada item (ordem ignorada), mais `storeId`, `startsAt`, `endsAt`, `validityNote` da campanha. Não entram: ordem, destaque, imagens/enquadramento, título, personalizações, modelo e "pausado".
- **Edição após aprovação**: se o hash muda com a campanha `aprovada`, `agendada` ou `publicada`, ela volta a `rascunho` (aprovação e agendamento limpos; histórico no audit). `publishedVersion` não muda: a vitrine continua mostrando o último instantâneo publicado até nova aprovação e publicação.
- **Vitrine**: campanhas com `publishedVersion`, status diferente de `encerrada` e data atual dentro do período do instantâneo. Itens pausados somem na hora. Custo nunca aparece.
- **Autoaprovação**: quem editou por último não aprova a própria campanha se existir outro admin/aprovador, exceto com `settings.requireApproval === false`. Conta com um único admin pode aprovar a própria.
- **Agendador** (worker, a cada minuto): publica `agendada` vencidas (se o hash ainda bate; senão volta a rascunho) e encerra campanhas com `endsAt` no passado. Idempotente.
- **Snapshot** (`campaign_versions.snapshot`): `{ campaign, items, pieces }` com datas ISO (`CampaignSnapshot` em `src/server/services/campaign-state.ts`).
- Endpoints extras: `invitations/lookup`, `products/categories`, `campaigns/[id]/versions/[v]`, `calendar`, `dev/emails` (só fora de produção), `storefront/[slug]`, `stores/[id]/prices`.
- Variáveis do worker: `RENDER_BASE_URL` (ou `APP_URL`), opcionais `EXPORT_CONCURRENCY`, `EXPORT_MAX_PAGES`, `EXPORT_RENDER_TIMEOUT_MS`, `EXPORT_INLINE=1` (exporta dentro do processo web, para desenvolvimento/testes).

## Vídeos (Etapa 5)

- **Fluxo**: `POST /api/campaigns/[id]/videos` (permissão `exports.create`; `assertUsage("video_second", duração + vídeos pendentes)`) cria `video_jobs` (`vid_…`, `na_fila`) e enfileira `video` (pg-boss, `retryLimit 2`, backoff). O worker (`src/worker/video-worker.ts`) reivindica com UPDATE atômico `na_fila → processando`, renderiza, envia o MP4 ao storage (`assets.kind = "video"`, chave `<org>/videos/<id>.mp4`), marca `concluida` e chama `recordUsage("video_second")`. Erro definitivo → `falhou` com mensagem em português; `POST /api/videos/[id]/retry` reenfileira. `DELETE /api/videos/[id]` cancela (o worker percebe na próxima atualização de progresso) ou apaga.
- **Recuperação**: batimento em `options.heartbeatAt`; `sweepStuckVideos` (no início do worker e na fila `video-sweeper`, a cada minuto) devolve à fila trabalhos em `processando` sem batimento há 3 min, ou marca `falhou` após 3 tentativas.
- **Planejamento** (`src/render/video/plan.ts`, puro): abertura (logo, título) → cenas de 1–3 produtos (destaques sozinhos e primeiro) → encerramento (validade, contatos, “Imagens meramente ilustrativas”). Garante ≥ 1,6 s de preço parado por cena; o que não cabe na duração entra em `plan.omitted` e vira aviso.
- **Cena** (`src/render/video/Scene.tsx` + `timeline.ts` + `runtime.ts`): camadas montadas com `template.renderPage()` (mesma linguagem visual do modelo v3); trilhas de quadros-chave aplicadas por um runtime JS determinístico (`window.__EV_VIDEO.seek(t)`). A mesma cena serve à prévia (`/render-video/[campaignId]?token=…`, token assinado `k: "video"`, tocando com requestAnimationFrame) e à geração.
- **Geração** (`src/server/video/*`, só no worker): `document.tsx` gera o HTML com `react-dom/server` (por isso **não pode ser importado por rotas do app**: `services/videos.ts` usa só `plan-bundle.ts`, `schema.ts`, `files.ts`, `tts.ts`); o Chromium do playwright abre a página numa origem falsa, cada quadro sai por CDP `Page.captureScreenshot` direto para o ffmpeg (`image2pipe` → libx264 crf 20, yuv420p, `+faststart`). Áudio: trilha sintetizada (`aevalsrc`), áudio próprio em loop e/ou narração TTS, mixados e depois multiplexados; o resultado é conferido com ffprobe (codec, resolução, duração, moov antes do mdat).
- **Narração**: `src/render/video/narration.ts` monta o texto por cena a partir dos dados (preços por extenso em pt-BR: “quatro reais e noventa e nove centavos o quilo”); o usuário edita antes de gerar. Provedores em `src/server/video/tts.ts` (`none`, `google`).
- **Modo inline** (`VIDEO_INLINE=1`/`EXPORT_INLINE=1`): a rota cria o trabalho e dispara `src/worker/video-run-once.ts` num processo filho.
