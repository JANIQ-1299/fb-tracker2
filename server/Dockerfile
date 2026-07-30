FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY server/package.json server/package-lock.json* ./server/
COPY package.json ./
RUN cd server && npm install

FROM base AS build
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
RUN cd server && npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/package.json ./server/package.json
WORKDIR /app/server
EXPOSE 4000
CMD ["node", "dist/index.js"]
