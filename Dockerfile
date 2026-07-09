# Stage 1: admin panel build
FROM oven/bun:1-alpine AS admin-build
WORKDIR /app/admin
COPY admin/package.json admin/bun.lock ./
RUN bun install --frozen-lockfile
COPY admin/ ./
RUN bun run build

# Stage 2: backend + admin dist
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY drizzle ./drizzle
COPY --from=admin-build /app/admin/dist ./admin/dist

USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
