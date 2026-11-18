# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.12.0 --activate

FROM base AS deps
# pnpm-workspace.yaml lleva allowBuilds (Prisma/esbuild); sin él install falla con ERR_PNPM_IGNORED_BUILDS.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# generate no abre la DB; placeholders solo satisfacen env() del schema.
ENV DATABASE_URL_API=postgresql://build:build@127.0.0.1:5432/postgres
ENV DATABASE_URL_MIGRATIONS=postgresql://build:build@127.0.0.1:5432/postgres
RUN pnpm exec prisma generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=development
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# node_modules del stage build (incluye .prisma generado); deps solo no alcanza.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/nest-cli.json ./nest-cli.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
