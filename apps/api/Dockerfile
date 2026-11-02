FROM node:26.13.0-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94

WORKDIR /app

COPY package.json package-lock.json ./
# `npm ci` runs the package's `postinstall`, which is `prisma generate`. That
# reads the schema, the migrations directory it points at, and the config that
# supplies the datasource, so all three have to be on disk before the install.
COPY prisma ./prisma
COPY prisma.config.mjs ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
