# Build the editor with Bun, then run the server (TypeScript, straight on Bun) with the
# built editor next to it. One image, one process: the server serves /api and the editor.
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.2-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY server ./server
COPY modules ./modules
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 8080
# Applies pending migrations on start (MIGRATE_ON_START=false turns it off), then serves.
CMD ["bun", "server/main.ts"]
