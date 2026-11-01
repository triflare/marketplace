# The build stage produces both halves of the app: the browser assets and the
# SSR bundle server.js runs. The API address is not baked into the browser
# bundle; it comes from config.yaml at runtime.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

# The runtime only needs the server, the client assets, and production
# dependencies: the compiler and dev server are build-time tools.
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build
COPY server.js config.js ./

# The image deliberately carries no config.yaml. Onboarding writes one into the
# data directory, which is the volume a deployment mounts.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3001
VOLUME ["/app/data"]

CMD ["node", "server.js"]
