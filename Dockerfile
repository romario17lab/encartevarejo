# Imagem única: aplicação web + worker (exportações, vídeos e agendamentos) no mesmo container,
# compartilhando a pasta de arquivos (STORAGE_DIR). Veja docs/07-hospedagem.md.
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}

# Chromium (exportação fiel à prévia), ffmpeg (vídeos) e fontes de apoio
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-noto-color-emoji ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHROMIUM_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    STORAGE_DIR=/data/storage

COPY package.json package-lock.json ./
# dependências de desenvolvimento também: o worker e as migrações rodam com tsx
RUN npm ci --no-audit --no-fund

COPY . .
# lidos na construção: endereço público (sitemap, páginas estáticas) e nome da marca
ARG APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_BRAND_NAME=EncarteVarejo
RUN APP_URL=$APP_URL NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME npm run build && chmod +x scripts/start-production.sh

ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["scripts/start-production.sh"]
