FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY web/package.json web/package-lock.json* ./web/
COPY package.json ./
RUN cd web && npm install

FROM base AS build
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY web ./web
RUN cd web && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/web/.next ./web/.next
COPY --from=build /app/web/node_modules ./web/node_modules
COPY --from=build /app/web/package.json ./web/package.json
COPY --from=build /app/web/public ./web/public
WORKDIR /app/web
EXPOSE 3000
CMD ["npm", "run", "start"]
