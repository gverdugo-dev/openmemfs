# Build the app with Vite (TanStack Start on Nitro, preset bun), then run the bundled server.
# One image, one process: it serves the editor and /api. Migrations ship next to it because
# the server applies them on start, from paths relative to the working directory.
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.2-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY migrations ./migrations
COPY src/modules ./src/modules
USER bun
EXPOSE 8080
# Applies pending migrations on the first request (MIGRATE_ON_START=false turns it off).
CMD ["bun", ".output/server/index.mjs"]
