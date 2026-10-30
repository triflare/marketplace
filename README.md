# marketplace

Find extensions, and share yours.

Two apps, one repository. They ship as two containers against a shared
PostgreSQL:

| Path        | What it is                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `apps/api`  | The registry. Express + Prisma over PostgreSQL, compiles published extension sources and serves the built extensions. |
| `apps/ui`   | The web frontend. React Router 8 with SSR, talks to the API server-side and never directly from the browser. |

## Running the stack

```bash
cp .env.example .env
# fill in SESSION_SECRET, e.g. openssl rand -hex 32
docker compose up --build
```

Then open <http://localhost:3001>. The API answers on
<http://localhost:3000/v1>, the frontend reaches it over the compose network at
`http://api:3000/v1`, and PostgreSQL listens on `127.0.0.1:5432`.

The API container applies the Prisma schema and any pending migrations on boot,
so a first run needs no manual migrate step.

Two named volumes hold the state: `postgres-data` for the database and
`triflare-data` for the published sources and blobs. Deleting the second loses
the registry's contents even though the database survives.

`docker compose up` requires `SESSION_SECRET`; the frontend refuses to start in
production without it, because sessions would not survive a restart.

## Deploying

The compose file is a development stack: plain HTTP, PostgreSQL credentials in
the file, and ports on localhost. Behind a proxy or on a real domain, set
`TRIFLARE_PUBLIC_BASE_URL` and `TRIFLARE_UI_PUBLIC_BASE_URL` to the public
origins (they end up in install links, badges, and OIDC redirects), and turn on
`TRIFLARE_REQUIRE_HTTPS` and `TRIFLARE_TRUST_PROXY` so the API reads the
forwarded scheme and client address. The API's
[configuration reference](apps/api/docs/configure.md) lists every
`TRIFLARE_*` variable, and its [deploy guide](apps/api/docs/deploy.md) covers
upgrades.

## Working on one app

Each app keeps its own `package.json` and lockfile and runs with plain `npm`.
There is no workspace tool at the root, so installs and scripts stay per app.

### API

```bash
cd apps/api
npm install
npm run dev        # http://localhost:3000
npm test           # needs a database: see below
```

The API needs PostgreSQL. `npm run test:setup` starts a throwaway one from
`apps/api/compose.test.yml` on `127.0.0.1:5432` and creates the test database;
it publishes the same port as the root stack, so stop one before starting the
other. `npm run check` runs lint, format check, the Prisma usage check, and the
test suite.

### Frontend

```bash
cd apps/ui
npm install
npm run dev        # http://localhost:3001
npm run typecheck
npm run test:e2e   # Playwright against a mock API
```

In development the app talks to `http://localhost:3000/v1` unless
`TRIFLARE_API_URL` says otherwise, so run the API first (or point it at an
existing instance). `apps/ui/.env.example` lists the three variables it reads.

## Product identity

Each app keeps its identity in a `product.yml`: name, version, tagline, author,
homepage, the brand palette, the API's config filename, the `extend` block that
names the compiler and CLI (`name`, `package`, `command`, `configFilename`) and
the project file every install and publish instruction is built from, and the
`envPrefix` its environment variables start with. The API reads its file at
boot, so a rebrand is an edit and a restart. The frontend parses its copy during the build and
inlines the values into both bundles, so a rebrand there needs `npm run build`
(or `docker compose up --build`) again.

## Repository layout

```
apps/
  api/      Triflare Marketplace API (own README, docs/, compose files, Dockerfile)
  ui/       Triflare Marketplace frontend, plus the Dockerfile this repo adds
.github/    CI, CD, and Dependabot for the whole repository
docker-compose.yml
.env.example
```

## CI

GitHub only reads `.github` at the repository root, so the workflows live there
and point into `apps/api` rather than sitting beside it:

- `ci.yml` runs the API's lint, format, Prisma usage check, unit tests, and the
  developer `npm run test:setup` path, on pushes and pull requests to `develop`.
- `cd.yml` repeats those checks, then builds `apps/api` and pushes the image to
  `ghcr.io/triflare/marketplace-api`. It still gates on `main` and `v*` tags, which
  this repository does not have yet; retarget it when the release branch or tag
  scheme exists.
- `dependabot.yml` has one entry per lockfile and Dockerfile, plus the root
  compose file's Postgres image.

Both workflows filter on `apps/api/**`, so a UI-only change does not start
them. The frontend has no workflow yet; `npm run typecheck`, `npm run build`,
and the Playwright suite in `apps/ui` are what one would run.
