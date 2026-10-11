#!/bin/sh
# Inicia a plataforma em produção: aplica migrações, prepara planos e calendário (sem conta de demonstração)
# e sobe a aplicação web e o worker no mesmo container. Se um dos dois parar, o container para e a
# hospedagem o reinicia.
set -e

# variáveis obrigatórias (veja docs/07-hospedagem.md)
for v in DATABASE_URL APP_URL APP_SECRET; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then echo "Falta a variável $v. Configure-a na hospedagem."; exit 1; fi
done
if [ ${#APP_SECRET} -lt 32 ]; then echo "APP_SECRET curto demais: use pelo menos 32 caracteres aleatórios."; exit 1; fi

npm run db:migrate
npm run db:seed -- --producao
# administração da plataforma: PLATFORM_ADMIN_EMAIL (opcional) recebe acesso a /admin.
# A pessoa precisa já ter se cadastrado; se ainda não, a inicialização segue normalmente.
if [ -n "${PLATFORM_ADMIN_EMAIL:-}" ]; then
  npm run admin:grant -- "$PLATFORM_ADMIN_EMAIL" || echo "Aviso: não foi possível dar acesso de administração a $PLATFORM_ADMIN_EMAIL."
fi
mkdir -p "${STORAGE_DIR:-/data/storage}"

# o worker abre as páginas de renderização na própria aplicação
export RENDER_BASE_URL="${RENDER_BASE_URL:-http://127.0.0.1:${PORT:-3000}}"

node_modules/.bin/next start -p "${PORT:-3000}" -H 0.0.0.0 &
WEB=$!
node_modules/.bin/tsx src/worker/index.ts &
WORKER=$!

trap 'kill -TERM $WEB $WORKER 2>/dev/null' TERM INT
# espera qualquer um dos dois terminar
while kill -0 $WEB 2>/dev/null && kill -0 $WORKER 2>/dev/null; do sleep 5; done
echo "Um dos processos parou; encerrando o container para reinício."
kill -TERM $WEB $WORKER 2>/dev/null || true
wait
exit 1
