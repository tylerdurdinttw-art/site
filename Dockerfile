# syntax=docker/dockerfile:1

# ---------- зависимости ----------
FROM node:20-slim AS deps
WORKDIR /app
# openssl нужен движку Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------- сборка ----------
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `npm run build` внутри себя дёргает prisma generate
RUN npm run build

# ---------- запуск ----------
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# standalone тащит с собой только реально нужные модули — образ выходит ~200 МБ вместо гигабайта
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Исходник плагина отдаётся эндпоинтом /api/plugin/download — он читает файл с диска
COPY --from=builder --chown=nextjs:nodejs /app/plugin ./plugin
# Схема нужна, чтобы можно было выполнить `prisma db push` этим же образом
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
