# The build stage produces both halves of the app: the browser assets and the
# SSR bundle server.js runs. The API address is not baked into the browser
# bundle; it comes from config.yaml at runtime.
FROM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

# The runtime only needs the server, the client assets, and production
# dependencies: the compiler and dev server are build-time tools.
FROM node:26.13.0-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216

WORKDIR /app

# The pinned image's package index is older than the v3.24 repositories it is
# pointed at, so zlib and the other base packages are upgraded to the patched
# builds before anything is installed on top of them.
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
# The server is started with `node server.js`, so npm is only a build tool here.
# Removing the global copy also removes the dependency tree bundled with it,
# which is npm's own and lags the versions the app's lockfile pins.
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/build ./build
COPY server.js config.js ./

# The image deliberately carries no config.yaml. Onboarding writes one into the
# data directory, which is the volume a deployment mounts.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3001
VOLUME ["/app/data"]

CMD ["node", "server.js"]
