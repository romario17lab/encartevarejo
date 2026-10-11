# EncarteVarejo (nome provisório)

Plataforma SaaS para supermercados, hortifrútis, açougues, padarias e mercadinhos transformarem uma lista de produtos em uma campanha promocional completa: encarte de várias páginas, posts, story, cartazes A4/A3, etiquetas de preço, banner da vitrine e slide para TV, todos a partir dos mesmos dados.

O nome da marca é configurável por `NEXT_PUBLIC_BRAND_NAME`.

## Estado atual (Etapa 2 — núcleo funcional)

Funciona de ponta a ponta: cadastro → loja e identidade visual → catálogo → campanha (modo rápido e editor) → salvamento automático e versões → aprovação → exportação PNG/JPEG/PDF e pacote ZIP.

| Área | O que existe |
|---|---|
| Contas | Cadastro, login, recuperação de senha, várias contas por usuário, convites, papéis (administrador, editor, aprovador), permissões checadas no servidor, histórico de alterações, exportação e exclusão dos dados da conta |
| Lojas | Várias lojas por conta (limite do plano), identidade visual compartilhada, endereço, contatos, redes, horários, preços por filial |
| Catálogo | Cadastro manual, upload de imagem com origem registrada, importação CSV/XLSX com mapeamento de colunas, colar lista de texto com revisão, atualização de preços em lote com prévia, duplicados, filtros de sem foto/incompleto, custo privado e margem |
| Campanhas | Modo rápido (modelo → produtos → conferir → gerar), editor avançado, 5 mecânicas de preço (simples, de/por, quantidade mínima, combo, clube) + limite por cliente, pagamento e condições, validações, destaques, ordem manual ou por categoria, enquadramento de foto sem distorção, desfazer/refazer, autosave com detecção de conflito, recuperação de rascunho local, histórico e restauração de versões, troca de modelo sem perder dados, duplicação para filiais |
| Aprovação | Rascunho → em revisão → aprovada → agendada → publicada → encerrada. Mudança de produto/preço/condição/data após aprovação exige nova aprovação. Publicação agendada e encerramento rodam no servidor (worker) |
| Modelos | 12 modelos originais e editáveis (supermercado, hortifrúti, açougue, padaria, bebidas, varejo, sazonais), cada um em 9 formatos, com versão fixada por campanha |
| Exportação | PNG/JPEG (300 dpi nos impressos), PDF no tamanho físico (com sangria opcional), pacote ZIP por canal com LEIA-ME, fila com novas tentativas e status |

Ainda não implementado (etapas seguintes): vitrine pública com página própria (os dados e a regra de publicação já existem no servidor), compartilhamento/métricas, calendário visual, cobrança, painel da plataforma, vídeos, IA, TV e modo agência. Ver "Pendências".

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

## Hospedagem (sugestão para a primeira versão)

Nada foi publicado. Para colocar no ar:

1. **Banco**: PostgreSQL gerenciado (ex.: Neon, Supabase, RDS) com backup diário automático e retenção de pelo menos 7 dias.
2. **Aplicação**: um servidor/container Node 22 rodando `npm run build && npm start` e outro processo `npm run worker` no mesmo ambiente (ex.: Railway, Render, Fly.io ou VPS com Docker). O worker precisa do Chromium instalado e de `RENDER_BASE_URL` apontando para a aplicação.
3. **Arquivos**: hoje em disco (`STORAGE_DIR`). Em produção use volume persistente ou troque o adaptador em `src/server/storage.ts` por um S3 compatível (Cloudflare R2, S3, B2), mantendo os arquivos privados.
4. **Proxy/HTTPS**: atrás de um proxy confiável, defina `TRUST_PROXY=1` e `APP_URL` com https (o cookie de sessão passa a ser `Secure`).
5. **E-mail**: configure `SMTP_URL` e `EMAIL_FROM`.

Serviços pagos só devem ser contratados com autorização do responsável.

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

- Vitrine pública (página, QR code, lista de interesse para WhatsApp), métricas e compartilhamento: Etapa 3.
- Cobrança real: exige escolher um provedor de pagamento e contas de teste (Etapa 4).
- Envio de e-mail real: exige SMTP.
- Vídeos, IA (extração de listas, remoção de fundo), TV e modo agência: Etapa 5; IA e narração dependem de serviços contratados.
- Busca por código de barras: exige uma fonte de dados real integrada.
- Conversão CMYK para gráficas não é feita; os arquivos são RGB e isso é informado no pacote.
