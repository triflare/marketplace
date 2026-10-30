# 🧩 Drivers

> **Status: built, with named gaps.** The host and registry are in `src/drivers/`. Auth and mail run through them, `magic-link`, `email-otp`, passkey sign-in and `magic-password` exist, and the admin, outbox and system endpoints are live. Blobs are written and read through the storage driver (`local`, `s3`), the publish path scans through the scanner driver (`patterns`, `clamav`), and builds resolve through the compiler driver (`extend`, `custom-cli`). The kinds whose catalog lists more providers than are built — `cache`, durable `jobs`, remote `search`, other `notify` channels, `metrics/otlp` — have no second call site yet, so naming one is a startup error rather than a silently ignored setting. Registration policy is `open` or `closed`; `invite` and `allowlist` are refused at startup.

A driver is a module that fills one slot in the instance: how people sign in, how mail is sent, where blobs live. An instance enables a mixture of them — several sign-in methods side by side, a failover chain of mail providers — and an admin can change that mixture from the running instance.

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [🧠 The Model](#-the-model)
- [🧩 The Driver Host](#-the-driver-host)
- [🔐 Authentication](#-authentication)
  - [Methods and policy are separate](#methods-and-policy-are-separate)
  - [One account, many identities](#one-account-many-identities)
  - [Magic password](#magic-password)
  - [Mixture semantics](#mixture-semantics)
- [✉️ Mail](#-mail)
- [⚙️ Configuration](#-configuration)
- [🖥️ Changing Drivers at Runtime](#-changing-drivers-at-runtime)
- [🔁 Reload and Restart](#-reload-and-restart)
- [📚 Driver Catalog](#-driver-catalog)
- [🧱 Implementation Plan](#-implementation-plan)
- [❓ Open Risks](#-open-risks)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 🧠 The Model

Three words, used precisely below:

- **Kind** — an area with one interface and a built-in registry: `auth`, `mail`, `storage`, `jobs`, and so on.
- **Driver** — a module implementing that interface, such as `magic-link` or `smtp`.
- **Instance** — a configured driver with an id and options. A kind may hold several instances: two OIDC providers, or mail providers tried in order.

Every driver exports a descriptor with the same shape:

```js
export const driver = {
  id: 'magic-link',
  kind: 'auth',
  label: 'Email link',
  capabilities: { signIn: true, register: true, link: true },
  requirements: { mail: true },
  options: [/* schema the admin form renders */],
  init(ctx),        // optional: open pools, load keys
  close(),          // optional: release them, called after the last request
  health(),         // optional: for /admin/drivers
  describe(ctx),    // what /auth tells a client, never a secret
  begin(ctx, input),// start a challenge: send a link, redirect to a provider
  complete(ctx, input), // finish it: consume the token, exchange the code
};
```

`begin`/`complete` is what lets one contract cover a password (one call), a magic link (two) and an OIDC redirect (two, with a browser in between). A driver never touches Express: `ctx` is `{ config, db, mail, request, log, now }`.

## 🧩 The Driver Host

The host owns the live instances and is the only thing that swaps them.

```js
// src/drivers/host.js
export function createDriverHost({ config, db, log }) {
  const state = new Map(); // kind -> { instances, revision, health }

  return {
    get(kind, id),            // resolved per call, never captured in a closure
    async reload(kind, next), // verify -> swap -> drain the old instances
    health(),
  };
}
```

Two rules make everything else possible:

1. **Callers resolve through the host.** `ctx.mail.send(...)`, not a `mail` captured in a router factory. A swap is visible on the next call.
2. **Drivers hold no module-level state.** Configuration is passed in at construction; pools and clients live on the instance and are released in `close()`.

`reload` builds the new instances first, then runs `verify()` — an SMTP connection, a Redis `PING`, a storage `probe()`. Only a verified instance is swapped in; the old one drains in-flight calls and closes. A failed verification leaves the running instance untouched and returns field errors.

That is the whole answer to "does this need a restart": almost never, as long as drivers are stateless and their clients are created per instance rather than per module.

## 🔐 Authentication

### Methods and policy are separate

The list mixes two different things. "Passkey only" and "magic links" cannot both be modes, but they can both be methods.

- **Methods** answer _how do I prove who I am_: password, magic link, OIDC, passkey, device code. Enable any subset. `GET /auth` advertises them; the sign-in page renders one control per method.
- **Policy** answers _what must be true_: `registration: open | invite | allowlist | closed`, `requireMfa`, `allowAccountLinking`.

"Passkey only" is therefore a method set of `[passkey]` (or `policy.passwordless: true` when an instance wants to hide an existing password). Registration stays policy, not a driver.

### One account, many identities

An account can carry several credentials and sign in with any of them. `UserIdentities` is generalized to `AuthIdentities(Driver, Subject, UserId, Email?, VerifiedAt)`, unique on `(Driver, Subject)`:

| Driver                             | Subject            | Where the secret lives              |
| ---------------------------------- | ------------------ | ----------------------------------- |
| `password`, `magic-password`       | the namespace      | `Users.PasswordHash` (scrypt)       |
| `magic-link`, `email-otp`          | the verified email | hashed, single-use verification row |
| `oidc`, `oauth2`, `trusted-header` | `issuer` + `sub`   | the provider                        |
| `passkey`                          | the credential id  | `Passkeys`                          |

Passkeys remain an MFA factor as well. Turning `requireMfa` on affects new sign-ins only; existing sessions keep the authority they were given.

### Magic password

_decided:_ it is the password driver with a generated secret and **email as the identifier**. The namespace is derived from the email plus a suffix, the password is shown once at signup and rotatable afterwards. It requires a mail driver; an instance without one cannot enable it.

Treated any other way — a password with no identifier and no delivery channel — it is a bearer token with no recovery path, which is not something this registry should hand out.

### Mixture semantics

- A method that creates accounts must have a unique subject: the same email cannot silently map to two accounts. Conflicts go through account linking, never a merge.
- Disabling a method does not sign anyone out; those sessions are method-agnostic. It does stop future sign-ins, so the API reports how many accounts hold that identity before applying.
- Changing `webauthn.rpId` is live but invalidates every existing passkey; it needs an explicit confirmation.

## ✉️ Mail

Mail is one interface with a failover chain:

```js
export const driver = {
  id: 'smtp',
  kind: 'mail',
  send(message, ctx), // { to, subject, text, html, replyTo, purpose }
  verify(),           // connection probe, used before a swap
};
```

- `mail.drivers` is ordered. A message goes to the first instance; the next is tried only on a transport failure, never on a rejected recipient.
- `none` means no mail: every feature with `requirements.mail` is refused at configuration time, which is exactly today's behavior.
- `log` writes a structured line and a row in the outbox, and is refused in production.
- Messages are recorded in an outbox before sending, so a delivery failure is visible in the admin UI and can be retried — the same pattern the webhook deliveries already use.
- Templates come from the product identity (`product.yml`), so a rebrand touches no mail driver.

Per-purpose routing (security mail through a different provider) is deliberately **not** in the first version; one chain is easier to reason about and to support.

## ⚙️ Configuration

```yaml
auth:
  methods:
    - driver: password
    - driver: magic-link
    - driver: oidc
      options:
        issuer: https://id.example.com
        clientId: marketplace
        clientSecret: ${TRIFLARE_OIDC_CLIENT_SECRET}
    - driver: passkey
  policy:
    registration: open
    requireMfa: false

mail:
  drivers:
    - driver: resend
      options:
        apiKey: ${TRIFLARE_RESEND_API_KEY}
        from: no-reply@example.com
    - driver: smtp
      options:
        host: smtp.example.com
        port: 587

drivers:
  storage: { driver: local, options: { dir: ./data } }
  cache: { driver: memory }
```

The existing layering is unchanged: built-in defaults, then `config.yaml`, then environment variables with the prefix from `product.yml` (`TRIFLARE_` by default). Boot refuses to start on an invalid mixture, with one message per problem:

| Condition                                                            | Result        |
| -------------------------------------------------------------------- | ------------- |
| `magic-link`, `email-otp`, or `magic-password` without a mail driver | startup error |
| `oidc` without issuer and client id                                  | startup error |
| `passkey` sign-in without `webauthn.rpId` or a public base URL       | startup error |
| `log` mail driver with `NODE_ENV=production`                         | startup error |
| Duplicate driver ids within a kind                                   | startup error |
| `none` mail with an auth method requiring mail                       | startup error |

## 🖥️ Changing Drivers at Runtime

Driver settings join the existing runtime-editable settings (`src/server-config.js`), so they get the same allowlist, YAML-document writes, persistence checks, and `restartRequired` reporting.

- `GET /admin/drivers` — per kind: instances, `state: active | disabled | error`, capabilities, requirements, masked options, `restartRequired`, `destructive`, `health`.
- `PUT /admin/drivers/:kind` — body `{ instances, confirm? }`. Validates the cross-kind invariants, writes `config.yaml`, applies live, and returns `{ applied: 'live' | 'restart', revision }`.
- `GET /admin/system` — `{ supervised, startedAt, configPath, driversRevision, lastReload }`.
- `POST /admin/system/reload` — re-read `config.yaml` and rebuild everything rebuildable. For hand edits and shared-volume deployments.
- `POST /admin/system/restart` — see below.
- `GET /admin/mail/outbox` — every message written before a provider saw it, newest first, filtered by `status` (`pending`, `sent`, `failed`) and `purpose`. The body is not in the list.
- `GET /admin/mail/outbox/:id` — one message with the body that was sent, which for a sign-in notice includes the one-time link.
- `POST /admin/mail/outbox/:id/retry` — send a message down the chain again, recording the attempt on the same row. A delivered message answers `409`; a refused one answers `502` with the provider's own words and keeps the failure on the row.

Secrets are masked on read (`{ set: true }`), kept when omitted on write, cleared only by an explicit `null`, and redacted from logs and audit entries. They live in `config.yaml` beside `oidc.clientSecret` today; environment variables still override them.

The web UI's Registry tab lists the same instances and edits them with a form generated from each driver's published option schema: driver choice, instance id, ordering (the chain is tried in order), and one field per option. Secrets are never filled in; a stored one is kept unless a new value is typed. A change that would affect existing accounts shows the confirmation the endpoint asked for and is sent again with `confirm: true` once it is accepted.

Responses that would affect existing accounts — disabling a method with N attached identities, changing `rpId` with N passkeys — report the count and require `confirm: true`. A dry run (`?dryRun=1`) returns the same numbers without applying.

## 🔁 Reload and Restart

**Soft reload is the default and needs no supervisor.** `server.js` gains a stable request handler:

```js
let currentApp = app;
server.on('request', (req, res) => currentApp(req, res));
```

A reload builds a fresh app (config, drivers, routers, rate limiter, background workers), swaps the pointer, then closes the previous one — drivers first, then the webhook, metrics and maintenance workers, then the Prisma pool if the database URL changed. The listening socket never closes.

**Process restart is the escape hatch.** `POST /admin/system/restart` with `{ confirm: 'restart' }` returns `202`, stops accepting connections, drains for up to `drainSeconds` (default 10), closes drivers and Prisma, and exits 0. It requires `TRIFLARE_SUPERVISED=1` — Docker's `restart: unless-stopped`, systemd's `Restart=always`, or an equivalent — and returns `409` without it, because exiting unsupervised is an outage with extra steps. Builds in flight are killed; their publish fails and the client retries.

What actually needs what:

| Change                                                   | How it applies                                   |
| -------------------------------------------------------- | ------------------------------------------------ |
| Add or remove an auth method, mail provider, credentials | live                                             |
| SMTP host or pool, API keys, OIDC client secret          | live                                             |
| `webauthn.rpId`                                          | live, with a destructive-change confirmation     |
| Session TTL, cookie secret, CORS, trust proxy            | live (new sessions only)                         |
| Compiler timeout, memory, minify                         | live (read per build)                            |
| `database.url`                                           | reload (new pool); restart recommended           |
| `port`, `apiRoot`, `requireHttps`                        | restart                                          |
| `dataDir`, storage backend                               | restart plus a migration; never swapped silently |
| Driver code itself                                       | restart on the new image                         |

## 📚 Driver Catalog

**Authentication:** `password`, `email-password`, `magic-link`, `email-otp`, `magic-password`, `passkey` (sign-in, not only MFA), `oidc` × N, `oauth2` presets (GitHub, Discord), `saml`, `ldap`, `trusted-header` (reverse-proxy SSO), `device-code`, `recovery`.

**Mail:** `none`, `log`, `smtp`, `resend`, `ses`, `postmark`, `mailgun`, `sendgrid`, `http` (POST JSON to a gateway), `file` (writes `.eml` under the data directory, for tests).

**Other kinds**, in the order they are worth building here:

| Kind       | Today                                      | Drivers                                                           |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `storage`  | local files under `dataDir`                | `local`, `s3` (and S3-compatible: R2, MinIO), `gcs`, `azure-blob` |
| `cache`    | in-process counters                        | `memory`, `redis` — required once there is more than one replica  |
| `jobs`     | inline webhook delivery and hourly metrics | `inline`, `db-outbox`, `redis`, `sqs`                             |
| `search`   | Postgres trigram                           | `postgres`, `meilisearch`, `typesense`                            |
| `captcha`  | none                                       | `none`, `turnstile`, `hcaptcha`, `recaptcha`                      |
| `scanner`  | risky-pattern scan                         | `patterns`, `clamav`, `virustotal`                                |
| `notify`   | in-app notifications                       | `in-app`, `email`, `webhook`, `discord`                           |
| `metrics`  | Prometheus text                            | `prometheus`, `otlp`                                              |
| `compiler` | `compiler.command`                         | `extend`, `custom-cli`                                            |

Built today: auth `password`, `passkey`, `oidc`, `device-code`, `magic-link`, `email-otp`, `magic-password`; mail `none`, `log`, `smtp`, `resend`, `postmark`, `sendgrid`, `mailgun`, `http`, `file`; `storage/{local,s3}`, `jobs/inline`, `search/postgres`, `captcha/{none,turnstile,hcaptcha,recaptcha}`, `scanner/{patterns,clamav}`, `notify/in-app`, `metrics/prometheus`, `compiler/{extend,custom-cli}`. Naming anything else is refused at startup, with the available drivers in the message.

The kinds whose other providers are not built are the ones with no second call site yet: `cache`, the durable `jobs` backends, the remote `search` backends, `notify` channels other than in-app, and `metrics/otlp`. They are listed in the catalog because the interface is settled, not because an operator can select one today.

Drivers are built in. The registry is keyed by string and never loads an npm package at boot, because that is remote code execution with the database URL in scope.

## 🧱 Implementation Plan

1. **Host and registry.** Done: `src/drivers/{host,registry,config}.js`, descriptors for password, OIDC, passkey and the device flow, `GET /auth` listing methods, `GET`/`PUT /admin/drivers`, `/admin/system/{reload,restart}`, and the reloadable app pointer in `server.js`. The existing suite stays green.
2. **Mail.** Done: `MailOutbox`, `none`/`log`/`smtp`/`resend`/`postmark`/`sendgrid`/`mailgun`/`http`/`file`, failover down the chain, per-instance state in `/admin/drivers`, and the admin outbox viewer and retry at `/admin/mail/outbox`.
3. **New methods.** Done: `magic-link`, `email-otp`, passkey sign-in and `magic-password`; `AuthIdentities` is the generalized table.
4. **Other kinds.** Done where a call site exists: `storage/{local,s3}` behind the blob store, `scanner/{patterns,clamav}` on publish, `compiler/{extend,custom-cli}` for builds, `metrics/prometheus` for the metrics endpoint, plus `jobs/inline`, `search/postgres`, `captcha/*` and `notify/in-app`, which are the current behavior behind the same interface. Blobs are written and read through the storage driver, so `storage/local` keeps the filesystem paths and `storage/s3` puts the same digest keys in a bucket; garbage collection for a remote backend is left to a bucket lifecycle rule, because the driver interface has no list call.

The remaining catalog entries are the ones with no second call site yet: `cache` (rate limiting is DB-backed), durable `jobs` backends (webhook delivery already has its own queue), remote `search` backends (discovery queries Postgres directly), `notify` channels beyond in-app, and `metrics/otlp`. They are refused at startup, which is the honest answer until something calls them.

Registration policy is implemented for `open` and `closed` only; `invite` and `allowlist` are still refused at configuration time. A soft reload rebuilds the config, drivers, routers and rate limiter, but the webhook, metrics and maintenance workers keep the database handle they started with; a changed `database.url` therefore needs a restart.

The admin UI has a **Drivers** tab (the same catalog and editor as the API, plus reload and restart for the running process) and an **Outbox** tab (the mail outbox with the message body and retry). Registry settings, broadcasts and usage data stay on the Registry tab.

Touch points: `src/config.js` (defaults and validation), `src/app.js` (build from a host), `src/blob-store.js` (blob bytes through the storage driver), `src/server.js` (reload and restart), `src/routes/auth.js` and `src/routes/sessions.js` (describe and sign-in), `src/routes/email-otp.js`, `src/routes/admin.js`, `src/routes/mail-outbox.js`, `src/routes/drivers.js`, `src/server-config.js`, `openapi/v1.yml`, `docs/configure.md`, and the UI's Drivers and Outbox tabs plus `apps/ui/src/lib/api`.

## ❓ Open Risks

- **Multiple replicas.** A driver change applies to the replica that served it. Blobs on local disk already require shared storage for more than one instance, so the honest scope is single-replica until a `drivers_revision` row and `LISTEN/NOTIFY` exist.
- **Storage migration.** Switching backends leaves existing digests on the old one; the change must be gated on a documented migration, not applied like a mail key.
- **Secrets on disk.** `config.yaml` is the source of truth and holds provider secrets; deployments must mount it read-writable only for admins, with restrictive permissions.
- **Deliverability.** Magic links are only as good as the mail path. SPF/DKIM advice belongs in the deploy guide, and a bounced link must not leak whether an account exists.
- **Enumeration.** Magic-link and magic-password endpoints answer identically for unknown and known addresses, and are rate limited per address and per IP.
