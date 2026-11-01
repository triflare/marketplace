# 🪽 Quick Deploying Guide

> **Important:** You should know at least a little bit of Docker, databases, and Node.js before you deploy an instance of Triflare Marketplace.

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [⚠️ Prerequisites](#-prerequisites)
- [⬆️ Upgrading from the SQL-migration releases](#-upgrading-from-the-sql-migration-releases)
- [➕ Deploy with Docker Compose](#-deploy-with-docker-compose)
- [⚙️ Configuration](#-configuration)
- [ℹ️ The Build Sandbox](#-the-build-sandbox)
- [📊 Data Persistence](#-data-persistence)
- [⏭️ What's Next](#-whats-next)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## ⚠️ Prerequisites

To deploy an instance of Triflare Marketplace, you will need:

1. Node.js v24 or newer.
2. A reachable PostgreSQL database (v16 recommended).
3. A PostgreSQL connection URL. First-run onboarding asks for it, or you can set `database.url` in `config.yaml` before the instance starts.

   > The configuration file is the only place settings live; there are no environment variables to set.

4. A database role that may create tables, indexes, functions, and triggers. The schema is applied by the instance itself on first boot.
5. The `pg_trgm` extension available to that role. The baseline migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` before the trigram index that uses it, and on a managed PostgreSQL that extension is often restricted to a superuser or a role with `CREATE` on the database. Enable it once as an operator (`CREATE EXTENSION pg_trgm`) if booting with the extension already installed is easier than granting the privilege.

The first user account to sign up is automatically promoted to an administrator. Don't expose the API to the public Internet without creating your first user account. Do so with either [the Triflare Extend CLI](https://github.com/triflare/extend) or an instance of the Triflare Marketplace UI.

## ⬆️ Upgrading from the SQL-migration releases

Releases before 2.2 applied their own numbered SQL files and recorded them in `schema_migrations`. The instance now runs Prisma Migrate instead, and adopts such a database rather than rebuilding it. This release also renames every table and column the application owns from snake_case to PascalCase, so a tool that reads the database directly must be updated to the new names.

Stop every previous-release instance before starting the first new-release instance, which applies the rename on boot. Rolling or blue/green deployments with both releases active against the same database are unsafe: after the rename, previous-release instances cannot use the renamed tables and columns.

The rules, all enforced at boot inside one transaction that holds an advisory lock:

- If the database has no migration history at all, the baseline is applied: a fresh install needs nothing from you.
- If `schema_migrations` holds every migration the SQL releases shipped (`0001_init.sql` through `0028_version_warnings.sql`), the baseline is recorded as already applied and the schema is brought up to date by Prisma Migrate — including the per-version download rollup (`0029_version_download_metrics.sql`) that followed those releases, and the rename of the tables and columns to PascalCase. Your existing rows, sequences, and data directory are preserved; only the identifiers change.
- If it holds some but not all of them, the instance refuses to start and says so. A partial history cannot be adopted: marking the baseline applied would skip whatever the missing files built, and running it would fail against tables that already exist. Finish the upgrade with the release that owns those files first.
- If `_prisma_migrations` already holds the baseline, the database is on Prisma Migrate and pending migrations are applied. The legacy `schema_migrations` table is folded into its PascalCase name (`SchemaMigrations`) first.

This is a one-way door. Taking a backup first is not optional — the baseline is a single migration, so there is no partial set of steps to roll back to.

Recovery, if a deployment is interrupted mid-adoption and leaves the baseline recorded without the rest of the history in place:

```bash
npx prisma migrate resolve --rolled-back 0_baseline --config prisma.config.mjs
```

`prisma.config.mjs` reads `database.url` from the same `config.yaml` the server uses, so the command is pointed at the instance's database without a `DATABASE_URL` variable.

That removes the baseline's row so the next boot records it again. `--applied` does the opposite, marking it applied without running it, which is what the bridge does for a complete legacy history and should not be needed by hand.

## ➕ Deploy with Docker Compose

You can run a prebuilt image of Triflare Marketplace at `ghcr.io/triflare/marketplace-api`. The image carries no configuration, so the first boot serves a setup screen.

1. Copy the compose file to a directory of your choice:

   ```bash
   cp compose.example.yml <YOUR_DIRECTORY>/compose.yaml
   ```

2. Deploy:

   ```bash
   docker compose up -d
   ```

3. Open <http://localhost:3000/onboarding> and fill in the database URL and the settings the instance should start with. The screen writes `config.yaml` into the mounted data volume and starts the full instance without a restart.

The container applies the schema and any pending migrations on boot, before it starts serving, so a first deploy needs no manual migrate step. On a database that a previous SQL-migration release built, read the upgrade section above first.

To configure the instance from a file instead, mount one and pass its path as the first argument: `node src/server.js /app/config.yaml` with `/app/config.yaml` bind-mounted from the host. The keys are the ones in the [configuration reference](./configure.md). A mounted file must be writable by the process if you also want to use the setup screen or the admin configuration endpoint.

## ⚙️ Configuration

The [configuration reference](./configure.md) has every key you can set in Triflare Marketplace. These keys matter the most in a production deployment:

- `publicBaseUrl`: the public URL of the instance.
- `trustProxy`: set when the API is running behind a reverse proxy. [See Express' trust proxy values](https://expressjs.com/en/guide/behind-proxies/).
- `requireHttps`: reject HTTP requests.
- `apiRoot`: the URL prefix all routes are served under (default is the `defaults.apiRoot` in `product.yml`, currently `/v1`).
- `environment`: set it to `production` on a live instance.

## ℹ️ The Build Sandbox

Since [Triflare Extend](https://github.com/triflare/extend) sends an archive of your repository when you publish, your deployed instance must compile the code itself, so that code owners can check out their code later (and for future features).

When it does, it runs its own copy of Triflare Extend to compile the code. But, it does so in a sandboxed environment. That sandbox is:

- **Filesystem:** The sandbox restricts Triflare Extend to only allow it to read and write files to its own temporary directory.
- **Memory:** By default, Triflare Extend is capped at 192 MB of memory. If memory can't be allocated, the build step will fail.
- **Timeout:** If Triflare Extend takes more than 30 seconds (by default) to compile the extension, it is terminated.
- **No Secrets:** Triflare Extend only shares a few environment variables with the host, but all others are not sent.

But, one important thing worth noting is that the environment can't sandbox the network. You are in charge of your own network isolation.

You can substitute the default Triflare Extend build tool with your own (called by `node <command> build -o <out>`) with `compiler.command` in `config.yaml`.

## 📊 Data Persistence

Published extension source code is saved to disk, not a database. So, you must mount a persistent Docker volume at `/app/data` (or whatever data directory you have set) to keep the saved data. If you are running your deployed instance on multiple servers, you must find a way to share that persistent storage.

The instance's own `config.yaml` lives there too: the image carries no configuration, so the first-run screen writes `config.yaml` into the data directory, and the admin configuration endpoints edit that same file. It is read on the next boot, so a setting that needs a restart takes effect on the next deploy. The file must be writable by the process for either screen to save anything.

## ⏭️ What's Next

- [Configuration Reference](./configure.md): see every key you can set in Triflare Marketplace.
