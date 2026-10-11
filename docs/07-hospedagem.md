# 07 — Hospedagem: como colocar a plataforma no ar

Nada foi contratado nem publicado. Este guia é para o dono do projeto decidir e, com autorização, executar.
Preços consultados em 11/10/2026 nas páginas oficiais; confira de novo antes de contratar, porque mudam.

## O que precisa rodar

| Peça | Para quê |
|---|---|
| Aplicação web (Next.js) | Telas, editor, vitrine, API |
| Worker | Exportações (Chromium), vídeos (ffmpeg), publicação e encerramento agendados |
| PostgreSQL | Todos os dados (contas, produtos, campanhas, fila de tarefas) |
| Pasta de arquivos persistente | Fotos enviadas, exportações e vídeos |

Para simplificar, o repositório tem um **Dockerfile** que junta a aplicação web e o worker num único container, com Chromium e ffmpeg já instalados. Assim os dois enxergam a mesma pasta de arquivos (`/data`), sem precisar de um serviço de armazenamento separado. Ao iniciar, o container aplica as migrações do banco e cadastra planos e calendário comercial, **sem** criar a conta de demonstração (`scripts/start-production.sh`).

## Opção recomendada: Railway

Por quê: a publicação é feita por cliques, a partir do repositório do GitHub; o banco PostgreSQL é criado no mesmo painel; tem pasta persistente (volume) com backup automático; cada nova versão aprovada no GitHub pode ser publicada sozinha. Não exige administrar servidor.

### Custo mensal estimado

O Railway cobra pelo uso (memória, processador, disco e tráfego), com um valor mínimo por mês que já vira crédito de uso.

| Item | Preço oficial | Estimativa para o início (poucas lojas) |
|---|---|---|
| Plano Hobby | US$ 5/mês, inclui US$ 5 de uso | para testar e as primeiras lojas |
| Plano Pro | US$ 20/mês, inclui US$ 20 de uso | quando houver clientes pagantes (volume de até 1 TB, equipe) |
| Memória | cerca de US$ 10 por GB/mês | app + worker ~0,8 GB e banco ~0,3 GB → ~US$ 11 |
| Processador | cerca de US$ 20 por vCPU/mês | uso médio baixo, ~0,15 vCPU → ~US$ 3 |
| Disco (volume) | cerca de US$ 0,16 por GB/mês | 5 a 10 GB → ~US$ 1 a 2 (backups cobrados igual) |
| Tráfego de saída | US$ 0,05 por GB | ~20 GB → ~US$ 1 |

**Total estimado: US$ 15 a 25 por mês no Hobby, ou cerca de US$ 20 a 30 no Pro**, mais o IOF do cartão internacional.
Isso é uma estimativa feita a partir dos preços oficiais e do consumo medido em teste local, não um orçamento: o valor real cresce com o número de lojas, exportações e vídeos. O painel do Railway permite definir um **limite de gasto** mensal; recomendamos configurar um.

Atenção: no Hobby o volume vai até 5 GB. Fotos, exportações e vídeos ocupam espaço, então ao ter clientes de verdade mude para o Pro.

### Outros custos (opcionais ou por uso)

| Item | Necessário? | Custo |
|---|---|---|
| Domínio próprio (.com.br) | Recomendado | cerca de R$ 40 por ano no registro.br (confira no site) |
| E-mail transacional (recuperar senha, convites) | Sim, para produção | Resend: grátis até 3.000 e-mails/mês e 100/dia |
| Stripe (cobrança dos clientes) | Quando for cobrar | sem mensalidade; taxa por pagamento recebido, veja stripe.com/br/pricing |
| IA (Anthropic), remoção de fundo (remove.bg), narração (Google) | Opcionais | por uso; os limites de créditos de cada plano seguram o gasto |

### Passo a passo (feito pelo dono, ou pelo Claude com autorização)

1. Criar conta em railway.com entrando com o GitHub e cadastrar o cartão.
2. **New Project → Deploy from GitHub repo** → escolher `romario17lab/encartevarejo`. O Railway encontra o Dockerfile sozinho.
3. No mesmo projeto, **New → Database → PostgreSQL**.
4. No serviço da aplicação, aba **Volumes**: criar um volume montado em `/data`. Na aba **Backups** do volume e do banco: ativar backup diário e semanal.
5. Aba **Variables** da aplicação (os segredos ficam só aqui, nunca no chat nem no GitHub):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao banco criado no passo 3)
   - `APP_SECRET` = um valor aleatório longo (o Railway tem um gerador; ou `openssl rand -hex 32`)
   - `APP_URL` = o endereço público, ex. `https://encartevarejo.up.railway.app` ou o domínio próprio
   - `TRUST_PROXY` = `1`
   - `NEXT_PUBLIC_BRAND_NAME` = nome da marca
   - `SMTP_URL` e `EMAIL_FROM` = dados do serviço de e-mail
   - opcionais: chaves do Stripe (modo de testes), `ANTHROPIC_API_KEY`, `REMOVEBG_API_KEY`, `GOOGLE_TTS_API_KEY` (lista completa em `.env.example`)
6. Aba **Settings → Networking → Generate Domain** (ou ligar o domínio próprio).
7. Esperar o primeiro deploy terminar e abrir o endereço.
8. Criar a conta do dono pelo cadastro normal e dar acesso à administração da plataforma: no serviço, abrir o terminal (ou `railway run`) e rodar `npm run admin:grant -- email-do-dono`.
9. Em **Usage → Limits**, definir um limite de gasto mensal.

Observação técnica: `APP_URL` e `NEXT_PUBLIC_BRAND_NAME` também são usados na construção da imagem (o Railway repassa as variáveis do serviço ao Dockerfile). Ao trocar o endereço ou a marca, faça um novo deploy.

## Alternativa mais barata: servidor próprio (VPS)

Um servidor virtual (ex.: Hetzner, DigitalOcean, Contabo) com 4 GB de memória custa menos por mês e roda o mesmo Dockerfile mais um PostgreSQL. Em troca, alguém precisa cuidar de atualizações de segurança, HTTPS, backups e monitoramento. Não recomendamos para quem não é desenvolvedor no início.

## Antes de abrir para clientes

- Trocar o Stripe de testes para produção só com decisão do dono (`BILLING_ALLOW_LIVE=1` e chaves `sk_live_`), depois de definir os valores dos planos.
- Testar a restauração de um backup do banco num projeto separado.
- Conferir o envio de e-mail (recuperação de senha) com o SMTP real.
- Revisar textos legais (termos de uso e política de privacidade/LGPD), que não fazem parte deste código.
