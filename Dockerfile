FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4310
ENV WEB_PORT=4310
ENV HOSTNAME="0.0.0.0"
ENV PROJECT_NAME="DEVTOOLS-RTS-MK1"
ENV APP_VERSION="1.0.0"
ENV PUBLIC_DNS_DOMAIN="devtools-rts-mk1.orbital8.cloud"
ENV NEXT_PUBLIC_APP_URL="https://devtools-rts-mk1.orbital8.cloud"
ENV RTS_DB_PATH="/app/data/rts-mk1.sqlite"

RUN mkdir -p /app/data/custom-maps && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 4310
CMD ["node", "server.js"]
