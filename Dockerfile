# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS builder
WORKDIR /app

# Native dependencies must be installed for the target Linux architecture.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node --print "require('./package.json').packageManager")" \
    && pnpm install --frozen-lockfile

COPY next.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN pnpm exec next build

FROM node:24-trixie-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
