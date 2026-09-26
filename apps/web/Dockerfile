FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S sanode && adduser -S sanode -G sanode
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
USER sanode
EXPOSE 3000
CMD ["apps/web/node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
