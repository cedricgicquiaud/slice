# SLICE, built like `pnpm build`. No secret goes in: the production settings
# (DATABASE_URL, BETTER_AUTH_SECRET, SLICE_ENCRYPTION_KEY…) are given when the
# container starts. Details: docs/configuration.md.
FROM node:22-bookworm-slim AS base
# corepack pins pnpm to package.json#packageManager, fetched once into the image.
ENV COREPACK_HOME=/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack install

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
