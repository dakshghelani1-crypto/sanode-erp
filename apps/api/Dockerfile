FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api prisma:generate && pnpm --filter api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S sanode && adduser -S sanode -G sanode
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
USER sanode
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
