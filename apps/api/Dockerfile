FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5

WORKDIR /app

# The pinned image's package index is older than the v3.24 repositories it is
# pointed at, so zlib and the other base packages are upgraded to the patched
# builds before anything is installed on top of them.
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
# `npm ci` runs the package's `postinstall`, which is `prisma generate`. That
# reads the schema, the migrations directory it points at, and the config that
# supplies the datasource, so all three have to be on disk before the install.
COPY prisma ./prisma
COPY prisma.config.mjs ./
# The server starts Prisma's CLI through `node` itself, so the runtime never
# runs npm. Removing the global copy also removes the dependency tree bundled
# with it, which is npm's own and lags the versions the app's lockfile pins.
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY . .

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
