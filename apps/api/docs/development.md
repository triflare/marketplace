# 🧑‍💻 Development Guide

> **Important:** Development is best done on Linux. There is support for Windows, but some tests fail because Windows still uses the outdated CRLF and applies that on every single file you save, so file comparisons will always fail.

Triflare Marketplace has a somewhat different development process than you're used to. If you make changes, make sure to:

1. Format the code:

   ```bash
   npm run format
   ```

2. Lint the code:

   ```bash
   npm run lint
   ```

3. Before you run tests, run the setup script (requires Docker):

   ```bash
   npm run test:setup
   ```

`npm run check` runs `lint`, `format:check`, and `test` sequentially and is the one to run before you push. It checks formatting without rewriting files; `npm run format` rewrites files.

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [📦 Getting Set Up](#-getting-set-up)
- [🗂️ Project Layout](#-project-layout)
- [🧪 Tests](#-tests)
  - [Raw SQL](#raw-sql)
- [🤖 CI and Releases](#-ci-and-releases)
- [📖 Working on the Docs](#-working-on-the-docs)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 📦 Getting Set Up

Node.js 24 or newer, Docker for the test database, and a PostgreSQL to run the server against.

```bash
npm install
npm run test:setup
npm test
```

`test:setup` starts a Postgres container (`compose.test.yml`) and creates the `triflare_test` database in it. Both are one-time steps per machine — the data lives in a named volume, so don't tear the container down between runs; `npm run test:teardown` stops it when you're done.

`npm install` runs `prisma generate` as its `postinstall`, which writes the client to `prisma/generated/client` (not in version control). If you change `prisma/schema.prisma` without reinstalling, run `npm run generate` yourself — importing a client that is older than the schema fails with a type error rather than a useful message.

To run the API itself, start it:

```bash
npm run dev
```

`npm run dev` restarts on file changes; `npm start` runs it once. Both read `config.yaml` from the working directory — the checkout's copy points at the local PostgreSQL — and the server runs `prisma migrate deploy` on boot, so there's no migrate step to remember. Pass a different file as the first argument (`node src/server.js path/to/config.yaml`), and use `--config path/to/config.yaml` with `npm run migrate` to apply migrations on their own. A checkout with no `database.url` starts in setup mode and serves `/onboarding` instead of failing; see the [configuration reference](./configure.md#-first-run-setup).

While developing a schema change, `npx prisma migrate dev --name <change>` writes a new migration from the difference between `prisma/schema.prisma` and a scratch database and regenerates the client. It needs a database it may reset; point it at your own, not at `triflare_test`.

The first account to sign up on a fresh database becomes the admin, which is worth knowing when your dev database is brand new.

## 🗂️ Project Layout

| Path                                                                                    | What it does                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server.js`                                                                         | Entry point: loads the config, migrates the database, boots the app and the background jobs, and shuts them down on a signal.                                                                                               |
| `src/app.js`                                                                            | Builds the Express app: the middleware order, the HTTPS and CORS gates, and which routers mount where under the API root.                                                                                                   |
| `src/config.js`                                                                         | The defaults, the `config.yaml` merge, and the first-run setup state. See the [configuration reference](./configure.md).                                                                                                    |
| `src/db.js`                                                                             | The Prisma client and its pool, the shared `BigInt`/lock helpers, the migration bridge, and the boot-time reconciliation of the data directory.                                                                             |
| `src/routes/`                                                                           | One file per resource — sessions, tokens, users, orgs, packages, blobs, discovery, notifications, admin. Each exports a factory that takes `shared`.                                                                        |
| `src/auth.js`                                                                           | Bearer token authentication, the automation-token scopes, and the admin/owner checks routes call.                                                                                                                           |
| `src/password.js`                                                                       | scrypt hashing and verification.                                                                                                                                                                                            |
| `src/rate-limit.js`                                                                     | The database-backed rate-limit buckets: login, signup, publish, download.                                                                                                                                                   |
| `src/http-rate-limit.js`                                                                | The coarse per-IP backstop in front of every route, built on `express-rate-limit`.                                                                                                                                          |
| `src/compiler.js`                                                                       | Runs the sandboxed build: the child process, its filesystem/memory/time limits, and the environment allowlist.                                                                                                              |
| `src/tarball.js`                                                                        | Packs and extracts the publish tarballs, with entry and byte caps so a hostile archive stays contained.                                                                                                                     |
| `src/project-manifest.js`                                                               | Derives the registry manifest from a project's `extend.yml` and validates it.                                                                                                                                               |
| `src/blobs.js`, `src/sources.js`                                                        | The content-addressed stores under `dataDir` for compiled output and retained sources.                                                                                                                                      |
| `src/maintenance.js`                                                                    | Blob garbage collection, the daily integrity sweep that re-hashes stored files, and the startup cleanup of stale temp files.                                                                                                |
| `src/observability.js`                                                                  | Request counts and timings, the optional per-request JSON log, and the Prometheus endpoint at `/admin/metrics`.                                                                                                             |
| `src/metrics.js`                                                                        | The daily download rollup into `ExtensionDailyDownloads`, and the distinct-download hashing.                                                                                                                                |
| `src/download-address.js`                                                               | The key that hashes client addresses for those statistics — read from `secrets.downloadHashKey` or `dataDir/secrets/`.                                                                                                      |
| `src/webhooks.js`                                                                       | Webhook signing, delivery, and retries.                                                                                                                                                                                     |
| `src/notify.js`, `src/audit.js`                                                         | Notification inserts (they join their caller's transaction) and the append-only audit trail.                                                                                                                                |
| `src/server-config.js`                                                                  | The settings an admin may change at runtime, and the check that the config file can hold them.                                                                                                                              |
| `src/serialize.js`                                                                      | The JSON shapes clients see, including the absolute URLs built from `publicBaseUrl`.                                                                                                                                        |
| `src/pagination.js`                                                                     | Cursor pagination: the cursor encodings and the `limit` parsing.                                                                                                                                                            |
| `src/errors.js`                                                                         | `HttpError` and the error handler that turns it into the problem-document body, with `instance`, `requestId`, and the `WWW-Authenticate` challenge.                                                                         |
| `src/problems.js`                                                                       | The slug catalogue every problem document's `type` resolves to, served at `/problems`.                                                                                                                                      |
| `src/request-id.js`, `src/http-hints.js`                                                | The `X-Request-Id` middleware, and the `res.json` wrapper that adds `?fields=` projection, `Link`, `ETag`/`304`, and `no-store` to every response.                                                                          |
| `src/drivers/`                                                                          | The registry, the host that swaps instances, and the auth, mail, storage, scanner and compiler drivers themselves. See the [driver guide](./drivers.md).                                                                    |
| `src/validators.js`                                                                     | `userEtag`, `orgEtag`, `versionEtag`: the revision a write names in `If-Match`, and the `428`/`412` checks that compare it.                                                                                                 |
| `src/idempotency.js`                                                                    | The `Idempotency-Key` middleware: the claim, the stored answer, the replay with `Idempotent-Replayed`, and the stale-claim takeover.                                                                                        |
| `src/fields.js`, `src/include.js`                                                       | `?fields=` parsing and projection, and `?include=` parsing against the relations an endpoint offers.                                                                                                                        |
| `src/methods.js`                                                                        | The `405`: its method table is read from the spec, so `Allow` names exactly what the description says the path accepts.                                                                                                     |
| `src/openapi.js`                                                                        | The parsed, cached copy of `openapi/v1.yml` that `/openapi/v1.yml` serves and the method guard reads.                                                                                                                       |
| `src/mail-templates.js`, `src/magic-link.js`, `src/email-otp.js`, `src/email-change.js` | The shared mail layout, the single-use link and code rows behind the address-based sign-in methods, and the confirmed change of address.                                                                                    |
| `src/return-to.js`                                                                      | `returnTo` resolution: a path or a trusted origin, never an attacker's URL carrying a freshly minted sign-in code.                                                                                                          |
| `src/routes/system.js`                                                                  | Liveness, readiness, the problem catalogue, the running OpenAPI description, the docs page, and the links index at the origin root.                                                                                         |
| `src/cors.js`                                                                           | The CORS headers, from `cors.allowedOrigins`.                                                                                                                                                                               |
| `src/transfer.js`                                                                       | Extension transfers between namespaces: the tables that move and the notifications that go with them.                                                                                                                       |
| `src/profile.js`, `src/image-sniff.js`                                                  | The profile field rules shared by accounts and organizations, and the signature checks on uploaded images.                                                                                                                  |
| `prisma/schema.prisma`, `prisma/migrations/`                                            | The schema and the migrations Prisma Migrate applies. `0_baseline` builds the whole schema from an empty database.                                                                                                          |
| `migrations/`                                                                           | The 29 SQL files the server used to apply itself. Archived: nothing reads them.                                                                                                                                             |
| `openapi/v1.yml`                                                                        | The OpenAPI description of the API surface, one file per major version. `v1.yml` describes the surface this branch serves.                                                                                                  |
| `test/`, `test-fixtures/`                                                               | The test suite and the extension projects it publishes end to end.                                                                                                                                                          |
| `scripts/test-run.mjs`                                                                  | The `npm test` runner: migrates the template database, runs the files concurrently against clones of it, and drops the clones afterwards.                                                                                   |
| `scripts/lint-openapi.mjs`                                                              | Structural checks on `openapi/v1.yml`: version agreement with `product.yml`, resolvable references, unique operation ids, declared tags, and problem media types on error responses. Runs as `npm run check:openapi` in CI. |
| `scripts/test-db.mjs`                                                                   | Creates the test database in the container, idempotently.                                                                                                                                                                   |
| `product.yml`                                                                           | The name, version, tagline, and defaults (config filename, API root). The version here must match `package.json`; a test enforces it.                                                                                       |
| `docs/`                                                                                 | The documentation in this directory.                                                                                                                                                                                        |

`product.yml` deserves a note: `/v1/meta` reports its `name`, `version`, and `tagline`, the server prints its name and version on boot, and `defaults` supplies the config filename and the API root. Bumping the version means touching both it and `package.json`.

## 🧪 Tests

The suite runs on Node's built-in test runner against a real database:

```bash
npm test
```

`scripts/test-run.mjs` is what `npm test` calls. It brings the test database up to date once as a template, then runs the files concurrently, each against a clone of it. The clone is what makes concurrency safe: every file calls `resetDb()` between tests, and separate databases mean two files running at once never truncate each other's rows. A clone is made with `CREATE DATABASE ... TEMPLATE`, which copies the template's migration history, so no file pays the migration cost.

A single file runs the same way, sharing the one database instead of cloning it:

```bash
node --test --test-force-exit test/packages.test.js
```

`--test-force-exit` matters because the download endpoint records its metric with
a fire-and-forgotten insert. That detached promise can leave Node's test harness
waiting at exit, which hangs the file rather than failing it; the flag lets the
file exit once its tests and hooks are done. `npm test` passes the same flag.

Concurrency follows `os.availableParallelism()`, kept between two and eight. Set `TRIFLARE_TEST_CONCURRENCY=1` to run the files one at a time against the shared database — the arrangement to reach for when a failure needs to be read without the other files' output interleaved.

`test/preflight.mjs` runs once before the files and just checks that the database answers. Without it a missing Postgres would fail every file separately with the same connection error, two hundred times over.

`test/helpers.mjs` is where the shared pieces live: `boot()` builds the app once per file (cloning its database when the run is isolated), `makeConfig()` composes test settings over the production defaults, `resetDb()` truncates between tests, and the signup/publish helpers drive the API the way a client would.

The suite runs against the real PostgreSQL its own migrations build, and the template is migrated with the same `runMigrations` the server does. The suite's database URL comes from `TRIFLARE_TEST_DATABASE_URL` (test-only) rather than the server's `config.yaml`.

### Raw SQL

Typed Prisma Client calls are the default. A statement is raw only when the typed client cannot express it — window functions, `DISTINCT ON`, `FOR UPDATE` locks, or an update whose new value is derived from the stored one. When that happens the statement goes in a named function with a one-line comment saying why, and the function's name is added to `ALLOWED_RAW_FUNCTIONS` in `scripts/check-prisma-usage.mjs`.

```bash
npm run check:prisma
```

That check also fails on an import of `postgres`, which is what the project used before Prisma Migrate. It runs in CI and in `npm run check`. `test-fixtures/` holds two complete extension projects, `hello` and `greeter`, whose committed `dist/` output the tests compare byte-for-byte against what the server's sandbox build produces — if a change to the build pipeline alters the compiled bytes, that's where it shows up.

If your database lives somewhere other than the container, point `TRIFLARE_TEST_DATABASE_URL` at it. The default is `postgres://postgres:postgres@localhost:5432/triflare_test`. The concurrent clones are created and dropped on that server, so the account in the URL needs permission to create databases and the server needs room for a handful of them at once.

## 🤖 CI and Releases

CI runs on every push and pull request to `devel`, on Node.js 24, in four jobs: `lint`, `format`, `test`, and `test-setup`. `lint` and `format` run in parallel; `test` and `test-setup` wait for both. The `test` job gets its Postgres from a service container; `test-setup` starts the database the way a developer does — `npm run test:setup` — and then runs the same suite, so the documented local path can't rot unnoticed.

Releases are cut by pushing a tag. The CD workflow runs on pushes to `main` and on tags matching `v*`: it re-runs lint, format, and test, then builds and pushes the Docker image to `ghcr.io/triflare/marketplace-api`. A `v*` tag produces `{{version}}` and `{{major}}.{{minor}}` image tags; a push to `main` produces `latest`.

The whole suite shares one version: `apps/api`, `apps/ui`, and both `product.yml` files read 1.1.0, and the API's major version is the path prefix, `/v1`. To cut a release, bump it everywhere, then tag:

1. `version` in `apps/api/package.json` and `apps/ui/package.json` — what `npm` reports for each checkout. Run `npm install` in each so the lockfile's root version follows.
2. `version` in `apps/api/product.yml` — the version `/v1/meta` reports and the server prints on boot — and in `apps/ui/product.yml`, whose version the UI build inlines.
3. `info.version` in `openapi/v1.yml` and the top entry in `CHANGELOG.md`, which is where each release's client-visible changes are written down.

```bash
git tag v1.1.0
git push origin v1.1.0
```

Leaving one behind the other gives an instance that reports a version it isn't — a test fails if they disagree, so CI catches it before the tag exists.

## 📖 Working on the Docs

The documentation is the `docs/` directory, and `docs/index.md` is the index that links to all of it. Pages link to each other with relative paths, so a moved page means fixing its inbound links.

Every page's table of contents is generated:

```bash
npm run doctoc
```

It rewrites the block between the `START doctoc` and `END doctoc` comments. Don't hand-edit those entries; run the command and commit what it produces. The headings in these files carry emoji, and new pages should follow the same convention.
