# The build stage produces both halves of the app: the browser assets and the
# SSR bundle `react-router-serve` runs. Vite inlines VITE_TWEXTHUB_API_URL here,
# so the API origin browsers use has to be decided at build time.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

ARG VITE_TWEXTHUB_API_URL=http://localhost:3000/v2
ENV VITE_TWEXTHUB_API_URL=$VITE_TWEXTHUB_API_URL

RUN npm run build

# The runtime only needs the server, the client assets, and production
# dependencies: the compiler and dev server are build-time tools.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build

ENV PORT=3000
USER node

EXPOSE 3000

CMD ["node", "node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]
