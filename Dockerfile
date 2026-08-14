# syntax=docker/dockerfile:1.7

FROM node:24-alpine3.22 AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development

COPY tsconfig.base.json tsconfig.json ./
COPY apps/api apps/api
COPY migrations migrations

EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS test
ENV NODE_ENV=test

COPY tsconfig.base.json tsconfig.json ./
COPY eslint.config.js vitest.config.ts vitest.integration.config.ts ./
COPY apps/api apps/api
COPY migrations migrations
COPY tests tests

CMD ["npm", "run", "test:all"]

FROM dependencies AS build

COPY tsconfig.base.json tsconfig.json ./
COPY apps/api apps/api
COPY migrations migrations

RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine3.22 AS production
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/migrations migrations

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/health/ready').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
