# ⚙️ Configuration Reference

Every instance of Triflare Marketplace reads its settings from a YAML file. There are no environment variables that override it: the file is the configuration. The default file is `config.yaml` in the working directory, and when there is none, `config.yaml` in the data directory — the mounted volume in a container deployment, which is where a settings change has to live to survive a redeploy. The server takes a different path as its first argument (`node src/server.js path/to/config.yaml`), and `node src/migrate.js` takes one as a positional argument or after `--config`.

Settings are applied in two layers:

1. The defaults built into the code.
2. The configuration file, merged over the defaults.

`database.url` is required for the full instance. A missing one is not fatal, though: the process starts in first-run setup mode and serves the onboarding screen described below. The screen writes the file itself, and it refuses to run unless that file is writable by the process.

Here is a configuration that uses the most important keys:

```yaml
port: 3000
dataDir: ./data
apiRoot: /v1
publicBaseUrl: http://localhost:3000
environment: development

onboarding:
  completed: true

process:
  supervised: false
  drainSeconds: 10

metrics:
  intervalMs: 3600000

secrets:
  downloadHashKey: null

requireHttps: false
trustProxy: false

database:
  url: postgres://postgres:postgres@localhost:5432/triflare
  maxConnections: 10
  connectTimeoutSeconds: 30
  idleTimeoutSeconds: 60

auth:
  sessionTtlDays: 7
  scrypt: { N: 16384, r: 8, p: 1 }
  oidc:
    issuer: null
    clientId: null
    clientSecret: null
    required: false
  webauthn:
    rpId: null # defaults to the hostname of publicBaseUrl
    rpName: null # defaults to the product name
  device:
    verificationUrl: null # the page a browser approves a CLI sign-in on
  reauthWindowMinutes: 10

rateLimits:
  loginAttemptsPerWindow: 5
  loginWindowMinutes: 15
  signupsPerIpPerWindow: 5
  signupWindowMinutes: 15
  publishPerWindow: 30 # null turns this bucket off
  publishWindowMinutes: 60
  downloadsPerIpPerWindow: 240 # null turns this bucket off
  downloadWindowMinutes: 5
  reportsPerWindow: 10 # null turns this bucket off
  reportsWindowMinutes: 60
  routesPerIpPerWindow: 600
  routeWindowMinutes: 15

pagination:
  defaultLimit: 20
  maxLimit: 50

limits:
  maxBlobBytes: 2097152
  maxAccountBlobBytes: 67108864
  maxSourceBytes: 1048576
  maxProfileImageBytes: 2097152

compiler:
  command: null
  timeoutMs: 30000
  memoryMb: 192
  addressSpaceMb: 1536
  minify: true

logging:
  requests: false

cors:
  allowedOrigins: '*'

banner:
  message: null
  link: null
```

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [🔀 How Settings Are Applied](#-how-settings-are-applied)
- [🚀 First-Run Setup](#-first-run-setup)
- [🌐 Server](#-server)
- [🗄️ Database](#-database)
- [🔐 Authentication](#-authentication)
  - [Signing in with an identity provider](#signing-in-with-an-identity-provider)
  - [Signing in with a passkey](#signing-in-with-a-passkey)
  - [Signing in from a CLI](#signing-in-from-a-cli)
  - [Choosing sign-in methods](#choosing-sign-in-methods)
- [🧩 Driver Kinds](#-driver-kinds)
- [🚦 Rate Limits](#-rate-limits)
- [📄 Pagination](#-pagination)
- [📦 Size Limits](#-size-limits)
- [🛠️ The Build Sandbox](#-the-build-sandbox)
- [🌍 CORS and Logging](#-cors-and-logging)
- [🖥️ Editing Settings at Runtime](#-editing-settings-at-runtime)
- [🔑 Other Settings](#-other-settings)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## 🔀 How Settings Are Applied

The configuration file is merged over the defaults one key at a time, so a file only has to set what it wants to change. An explicit `null` in the file means "not set" and falls back to the default — except for `rateLimits.publishPerWindow`, `rateLimits.downloadsPerIpPerWindow`, and `rateLimits.reportsPerWindow`, where `null` is how you switch a bucket off.

Every value is validated at boot. A typo such as `port: 3000x`, an invalid origin, or an unknown registration policy fails startup with a message naming the key, rather than becoming a surprising value on a request path. The same validation runs against a candidate file before onboarding or the admin configuration endpoint replaces the real one.

`environment` is a setting rather than `NODE_ENV`. It accepts `development` or `production`; production turns on the checks that only make sense on a live instance, such as refusing the `log` mail driver.

## 🚀 First-Run Setup

A fresh instance has no database URL and therefore nothing to serve but a setup screen. The process boots into a minimal app with no database client, no sessions, and no registry routes. It exposes:

- `GET /onboarding` — an HTML form, or the same data as JSON when the request prefers `application/json`.
- `GET /onboarding/status` — the same status as JSON, always.
- `POST /onboarding` — validates and saves the submitted settings.

The router is mounted at both `/onboarding` and `<apiRoot>/onboarding`, so a deployment behind a prefix can reach it either way.

Onboarding asks for everything an instance usually needs to change before it is useful: the database URL, public base URL, environment, listen port, API root, HTTPS and proxy settings, browser origins, registration policy, session lifetime, passkey settings, the CLI approval page, restart supervision and drain time, the download rollup interval, request logging, and an optional download address hash key. Every field is optional on a later run: a blank submission keeps the value already in the file, and a secret is never sent back to the browser.

Before the form is usable, the process checks that it can write the configuration file. If it cannot, `GET /onboarding` explains why and `POST /onboarding` answers `409`. It also reports whether the file sits on a volume; a writable file in a container's own layer will be lost when the instance is recreated, so the screen warns about that even though it allows the save.

A successful save:

1. Writes the submitted values through the parsed YAML document, preserving comments and key order.
2. Writes a sibling temporary file and loads it with the same validation the server uses.
3. Probes the database with `SELECT 1`.
4. Renames the temporary file over the real one.
5. Sets `onboarding.completed: true`.
6. Rebuilds the full app in the same process, running migrations and opening the pool without restarting the listening socket.

If any step fails, the original file is left untouched and the screen reports the error.

A configuration written before onboarding existed has no marker. A file with a `database.url` is treated as already onboarded, so an existing deployment is not dragged back to the setup screen. An explicit `onboarding.completed: false` always wins, and a file with no database URL is never considered complete.

## 🌐 Server

- `port`: Port the HTTP server listens on. Defaults to `3000`.
- `dataDir`: Directory holding everything the instance stores on disk — compiled blobs, retained project sources, build temporary files, and the generated download-address key. Relative paths resolve against the working directory. Defaults to `./data`. It has to be persistent storage; see [Data Persistence](./deploy.md#-data-persistence).
- `apiRoot`: URL prefix every route is served under. Leading and trailing slashes are ignored, so `/v1` and `v1` are the same thing; an empty string serves the API at the root. Defaults to the `defaults.apiRoot` value in `product.yml` (`/v1`).
- `publicBaseUrl`: Absolute URL of the instance, used to build download, source, and profile image links in responses. Defaults to `http://localhost:3000`.
- `banner.message`: A one-line announcement the web client scrolls across the top of every page — a maintenance window, a sign-in method that just changed. Defaults to `null` (no banner); at most 280 characters, whitespace folded to single spaces.
- `banner.link`: Where the banner points for details. An absolute `http` or `https` URL, or `null`; dropped when there is no `banner.message`.
- `requireHttps`: Reject plain HTTP requests with a `403`. Turn it on when the instance is served over TLS. Defaults to `false`.
- `trustProxy`: Handed to Express as its [trust proxy](https://expressjs.com/en/guide/behind-proxies.html) setting. Set it when the API runs behind a reverse proxy, or the rate limits will count the proxy's address instead of each client's. Defaults to `false`.

## 🗄️ Database

- `url`: PostgreSQL connection URL. Required, with no default; without it the instance stays on the setup screen.
- `maxConnections`: Size of the connection pool. Defaults to `10`.
- `connectTimeoutSeconds`: How long to wait for a connection before giving up. Defaults to `30`.
- `idleTimeoutSeconds`: How long an unused connection is kept before closing. Defaults to `60`.

The three pool settings map onto the `pg` pool the Prisma client runs on: `maxConnections` is its `max`, `connectTimeoutSeconds` its `connectionTimeoutMillis`, and `idleTimeoutSeconds` its `idleTimeoutMillis`. The pool it opens is also pinned to a UTC session, so a server whose own `timezone` is set to something else still returns the timestamps the API was built against.

Migrations are applied by Prisma Migrate. The server runs `prisma migrate deploy` as part of booting — before it serves anything — and `node src/migrate.js` runs the same thing on its own when you would rather not start the server. Both take the database URL from this setting; the `database.url` key is what the CLI is handed, so there is no second place to keep it.

## 🔐 Authentication

- `sessionTtlDays`: Lifetime of a sign-in session, in days. It applies to sessions created after the change; existing sessions keep the expiry they were given. Defaults to `7`.
- `scrypt`: Cost parameters (`N`, `r`, `p`) for password hashing. Each stored hash records the parameters it was made with, so changing them affects new passwords without invalidating old ones. The defaults (`16384`, `8`, `1`) are a sensible balance; raising `N` makes every sign-in more expensive for the server.
- `oidc.issuer`: Base URL of an OpenID Connect provider, with a trailing slash allowed. Setting it (with `clientId`) turns on provider sign-in. Defaults to `null` (off).
- `oidc.clientId`: Client identifier registered at the provider.
- `oidc.clientSecret`: Client secret for a confidential client. Leave unset for a public client that authenticates with PKCE alone.
- `oidc.required`: When `true`, password sign-in and registration are refused and the provider is the only way to get an account. Defaults to `false`.
- `device.verificationUrl`: The page a browser visits to approve a CLI sign-in. Defaults to `null`, which turns the device flow off.
- `webauthn.rpId`: The domain passkeys are scoped to — the hostname of the site that runs the ceremony, without a scheme or port. Defaults to `null`, which uses the hostname of `publicBaseUrl`. Set it explicitly when the web client is served from a parent domain of the API (for example `example.com` with the API on `api.example.com` and the client on `app.example.com`) or from a different host.
- `webauthn.rpName`: The name an authenticator shows when it offers to store a passkey. Defaults to `null`, which uses the product name.
- `reauthWindowMinutes`: How long a session counts as recently authenticated for the operations that demand it — adding or removing a passkey, regenerating backup codes. Must be a finite positive number. Defaults to `10`.

`oidc.issuer` and `oidc.clientId` must be set together, and `oidc.required` cannot be turned on without both — the server refuses to start otherwise, so an instance cannot lock itself out of every way in.

### Signing in with an identity provider

Point `oidc.issuer` at the provider's base URL (the same value it publishes as its `issuer`); discovery is read from `<issuer>/.well-known/openid-configuration`. Register the instance's callback URL at the provider:

```
<publicBaseUrl>/<apiRoot>/auth/oidc/callback
```

For example, `http://localhost:3000/v1/auth/oidc/callback`. The redirect URI is derived from `publicBaseUrl` and `apiRoot` rather than configured, so it cannot drift from what the instance actually serves.

The routes are:

- `GET /auth` — public; says whether password sign-in is offered and, when the provider is on, its issuer and whether it is required. A sign-in page reads this to decide what to render.
- `GET /auth/oidc/authorize` — starts a sign-in. Add `returnTo` to send the browser somewhere specific afterwards; it must be a path on this instance or an origin listed in `cors.allowedOrigins`. A browser (an `Accept: text/html` request) is redirected to the provider; an API client gets `{ "authorizationUrl": ... }`.
- `GET /auth/oidc/callback` — where the provider sends the browser back. In a browser it redirects to `returnTo` with a one-time `oidc_code`; an API client receives the session directly.
- `POST /auth/oidc/exchange` — trades the browser's one-time `oidc_code` for the session, so the session token is never carried in a URL.
- `POST /auth/oidc/link` — starts linking the provider to the signed-in account (session required).
- `GET /auth/oidc/identities` and `DELETE /auth/oidc/identities/<id>` — list and remove the account's linked identities. The last way into an account cannot be removed if it would leave the account unreachable.

The first account created through the provider becomes an admin, exactly as the first password registration does. An account's namespace comes from the provider's `preferred_username` (or `nickname`/`username`) when it can be one, with a `user-<hash>` fallback. Email is stored for reference and is never used to match or link accounts — only the provider's `iss`/`sub` pair is.

When `oidc.required` is on, `POST /sessions` and `POST /users` return `403`; existing sessions and tokens keep working. Turn it on only after you have signed in through the provider at least once, so the instance always has an admin.

### Signing in with a passkey

Multi-factor authentication is per account and opt-in: an account registers one or more passkeys, and from then on a password (or provider) sign-in stops at a second step until a passkey or a backup code confirms it. An account with no passkeys signs in exactly as before, so an instance that never enables MFA is unaffected.

The ceremony runs in the browser, so the page that calls `navigator.credentials` has to be served from an origin the server trusts. The server accepts the `publicBaseUrl` origin plus every origin in `cors.allowedOrigins` (a `*` there contributes nothing, since the browser sends a concrete origin). Passkeys are scoped to `webauthn.rpId`; its default — the hostname of `publicBaseUrl` — is right when the web client and the API share a site, and needs setting when they do not.

The routes are:

- `GET /auth/mfa` — the account's MFA state: whether it is on, its passkeys, and how many backup codes remain (session required).
- `POST /auth/mfa/passkeys/options` and `POST /auth/mfa/passkeys` — register a passkey (recent authentication required for both requests). The first one turns MFA on and returns ten backup codes, shown once.
- `PATCH /auth/mfa/passkeys/<id>` and `DELETE /auth/mfa/passkeys/<id>` — rename or remove a passkey. Removing the last one turns MFA off and discards the backup codes.
- `POST /auth/mfa/backup-codes` — replaces every backup code with ten new ones. The old set stops working immediately.
- `POST /auth/mfa/reauth/options` and `POST /auth/mfa/reauth` — satisfy a recent-authentication check with a passkey, without signing in again.

The second step of a sign-in uses its own pair:

- `POST /auth/mfa/options` — hands out a WebAuthn challenge for the passkeys of the account waiting to sign in.
- `POST /auth/mfa/verify` — completes the sign-in with either a passkey assertion or a backup code, and returns the session.

Adding or removing a passkey and regenerating backup codes require the session to be recently authenticated: within `reauthWindowMinutes` of a sign-in (or of a completed `POST /auth/mfa/reauth`). A sign-in that just happened counts, so the common path needs nothing extra. Failed second-factor attempts count against the login rate limit, alongside failed passwords.

A sign-in that stops at the second step returns `202` with `{ "mfaRequired": true, "mfaToken": ..., "methods": [...] }` instead of the `201` session. The token is the credential for the `/auth/mfa/options` and `/auth/mfa/verify` calls and is shown once, like a session token. `POST /sessions`, `POST /auth/oidc/exchange`, and the API-client form of `GET /auth/oidc/callback` all answer this way when the account has MFA on.

### Signing in from a CLI

`extend login` signs in with a password prompt, and the provider and passkey paths both need a browser on the instance's own origin. A different client — another build tool, a script, anything that would rather not collect a password — cannot run either. The device authorization flow (RFC 8628) is for those: the client asks for a code, the person approves it in a browser, and the client polls until it has a session.

Set `auth.device.verificationUrl` to the page that approves a code to turn the flow on. With it unset, the endpoints answer `404` and `GET /auth` reports `device: null`, because a client that asked for a code would otherwise wait for a page nobody can visit. The API serves the endpoints; the page itself belongs to the web client.

The flow runs on five endpoints:

1. `POST /auth/device/code` with an optional `clientName`. The response has a long `deviceCode`, a short `userCode` in the `ABCD-EFGH` shape, `verificationUriComplete` with the code filled in, `expiresIn`, and the `interval` to poll at.
2. The person opens that URL. The page reads `POST /auth/device/lookup` with their session to show the client name, then calls `POST /auth/device/approve` or `POST /auth/device/deny`.
3. The client polls `POST /auth/device/token` with the `deviceCode`. Until the page approves it the answer is `400` with `error: authorization_pending`. A poll inside the interval answers `slow_down`, a refusal answers `access_denied`, and an unknown or expired code answers `expired_token`.
4. The poll after approval answers `200` with the same body as `POST /sessions` — `{ session, user, token }` — and consumes the code, so a replayed device code does not mint a second session.

Approval requires a session authenticated within `reauthWindowMinutes` of a sign-in or a completed `POST /auth/mfa/reauth`. An older session receives `403` until the person reauthenticates. The browser has to finish a passkey or provider sign-in before it has a session to approve with, and the client never sees either. A pending `mfaToken` from `POST /sessions` is not a session and is refused. An approved code stays uncollected until the client's next poll, so the page can still decline it in that window; that is also why the approval page should show the client name it got from the lookup.

The session this issues is the same credential `extend login` stores: every scope, `sessionTtlDays` of life, and revocable with `DELETE /sessions/current`. The device code is shown only to the client that asked, both codes are stored as hashes, and they expire after ten minutes.

### Choosing sign-in methods

By default the method set is derived from the settings above: password (unless `oidc.required` is on), the provider when it is configured, a passkey, and the device flow when it has an approval page. To choose a different set, list the methods under `auth.methods`; the keys above stop being consulted for which methods are on, and are filled in from the instances instead.

```yaml
auth:
  methods:
    - driver: password
    - driver: oidc
      options:
        issuer: https://id.example.com
        clientId: marketplace
        clientSecret: your-client-secret
    - driver: passkey
      options:
        rpId: example.com
    - driver: magic-link
  policy:
    registration: open
```

`magic-link` mails a single-use sign-in link and needs a mail driver; `email-otp` mails a six-digit code instead, for a device that cannot open a link; `magic-password` registers with a generated password that is shown once and signs in by address. `passkey` is sign-in with a passkey, not only the second factor. `registration` accepts `open` or `closed` today; `invite` and `allowlist` are refused at startup rather than silently opening registration.

The link lands on the API, which sends the browser on with a one-time `magic_link_code`. Pass `returnTo` to `POST /auth/magic-link` to say where: a path on this instance, or an absolute URL naming an origin in `cors.allowedOrigins`. The web client passes its own origin, so a client on another port or host needs that origin listed — the same requirement a passkey ceremony has.

An account that signs in by address can read it at `GET /auth/email` and move it: `POST /auth/email/change` mails a six-digit code to the new address, and `POST /auth/email/confirm` redeems it before any identity moves. Every mail-backed method on the account — `magic-link`, `email-otp` and `magic-password` today — follows the change, and an address another account already signs in with is refused. Without a mail driver the address is still reported but `changeable` is false and a change is a `403`.

`GET /auth` reports one entry per configured method under `methods`, with the older `passwordAuth`, `oidc` and `device` keys kept for clients that already read them, and `registration` saying whether an unknown person can still become an account. `GET /meta` carries the `banner` (or `null`), which is what the web client renders at the top of the page. The banner and the registration policy are both editable from the admin settings when the configuration file is persistent.

## 🧩 Driver Kinds

Every area with a built-in registry is a kind: `auth`, `mail`, `storage`, `jobs`, `search`, `captcha`, `scanner`, `notify` and `metrics`. Auth and mail have their own sections above; the rest live under `drivers`, one instance per kind:

```yaml
mail:
  drivers:
    - driver: resend
      options:
        apiKey: your-resend-api-key
        from: no-reply@example.com
    - driver: smtp
      options:
        host: smtp.example.com
        port: 587
        from: no-reply@example.com

drivers:
  storage: { driver: local, options: { dir: ./data } }
  jobs: { driver: inline }
  search: { driver: postgres }
  captcha: { driver: none }
  scanner: { driver: patterns }
  notify: { driver: in-app }
  metrics: { driver: prometheus }
  compiler: { driver: extend }
```

A blob store on S3-compatible storage (AWS S3, R2, MinIO) keeps the same digest keys as local disk, so the data directory can be copied into a bucket and the setting changed; leave garbage collection to a bucket lifecycle rule, because the server has no list call on the interface.

```yaml
drivers:
  storage:
    driver: s3
    options:
      bucket: marketplace-blobs
      accessKeyId: your-access-key-id
      secretAccessKey: your-secret-access-key
      region: auto
      endpoint: https://<account>.r2.cloudflarestorage.com
      pathStyle: true
  scanner:
    driver: clamav
    options: { host: clamav, port: 3310, timeoutMs: 15000 }
  compiler:
    driver: custom-cli
    options: { command: /opt/registry/build.mjs }
```

`scanner/clamav` streams every extracted file to the daemon and reports a detection in the same warning list the pattern scan produces. `compiler/custom-cli` runs a Node script in place of the bundled builder under the same sandbox, memory and time limits. `email-otp` joins `auth.methods` as a mail-using sign-in method; its codes are six digits, single-use, and bounded per address and per caller.

`mail.drivers` is ordered: a message goes to the first instance, and the next is tried only when the first fails to transport it, never when it rejects the recipient. `none` is no mail, and any auth method that needs mail is refused alongside it. `log` writes the message to the log and is refused when `environment` is `production`.

The sign-in messages are sent as both plain text and HTML under one alternate part: the button and the styled code are what most readers see, and the text is what a client that cannot render HTML falls back to. Both parts name the same single-use link or code, so neither is a weaker copy.

The startup check refuses a mixture it cannot serve, naming each problem: a mail-using method without a mail driver, an OIDC method without its issuer and client id, a passkey without a relying party, two instances sharing an id, or an unknown driver (with the ones this build has).

An admin can read the mixture and replace one kind's instances at runtime through `GET`/`PUT /admin/drivers` and inspect the process through `GET /admin/system`. A change is probed before it is written; a change that would affect existing accounts asks for `confirm: true`, and `?dryRun=1` reports the counts without applying anything. `POST /admin/system/reload` re-reads the file, and `POST /admin/system/restart` drains and exits so a supervisor can start the process again.

Every outbound message is written to the outbox before a provider sees it, so a failed delivery is something an admin can read and retry: `GET /admin/mail/outbox` lists what was sent and how it went, `GET /admin/mail/outbox/:id` shows the body that went out, and `POST /admin/mail/outbox/:id/retry` sends it again on the same row.

The admin UI mirrors this: a **Drivers** tab with the catalog, the schema-driven editor and the reload/restart controls, and an **Outbox** tab with the delivery list, the message body and retry. Registry settings, the broadcast and usage data stay on the Registry tab.

## 🚦 Rate Limits

Limits are counted in fixed windows aligned to the clock — a 15-minute window resets at :00, :15, :30, and :45 — and rejected requests carry a `Retry-After` header saying when the window rolls over.

- `loginAttemptsPerWindow` / `loginWindowMinutes`: Failed sign-ins, counted per namespace per IP and per IP overall. Defaults to `5` attempts per `15` minutes.
- `signupsPerIpPerWindow` / `signupWindowMinutes`: Sign-up attempts from one IP, counting attempts at both accounts and organizations whether they succeed or not. Defaults to `5` per `15` minutes.
- `publishPerWindow` / `publishWindowMinutes`: Publishes per account — per account rather than per IP because CI runners often share one. Defaults to `30` per `60` minutes.
- `downloadsPerIpPerWindow` / `downloadWindowMinutes`: Downloads from one IP. Defaults to `240` per `5` minutes.
- `reportsPerWindow` / `reportsWindowMinutes`: Reports filed per account — per account rather than per IP because a report is about somebody else's account, and the rate that matters is the one at which a single account can fill the moderators' queue. Defaults to `10` per `60` minutes.
- `routesPerIpPerWindow` / `routeWindowMinutes`: A coarse cap on every route, as a backstop for floods the buckets above don't cover. Loopback addresses are exempt. Both must be positive integers — the server won't start without them. Defaults to `600` per `15` minutes.

The publish, download, and report buckets can be switched off entirely with `null` in the file.

## 📄 Pagination

- `defaultLimit`: Page size when a client doesn't ask for one. Defaults to `20`.
- `maxLimit`: The largest page size a client may request. Defaults to `50`.

## 📦 Size Limits

- `maxBlobBytes`: Largest compiled extension the server will store for one version. Defaults to 2 MB.
- `maxAccountBlobBytes`: Total bytes one account may have stored across its versions and source archives. An admin can raise or lower it for a single account. Defaults to 64 MB.
- `maxSourceBytes`: Largest project tarball a publish may upload. Defaults to 1 MB.
- `maxProfileImageBytes`: Largest avatar or banner upload. Defaults to 2 MB.

## 🛠️ The Build Sandbox

Every publish is compiled on the server, in a child process with filesystem, memory, and time limits. The [deploy guide](./deploy.md#-the-build-sandbox) describes what the sandbox does; these keys tune it:

- `command`: Path to a Node.js script (`.js`, `.mjs`, or `.cjs`) used instead of the bundled Triflare Extend, called as `node <command> build -o <out>`. Defaults to the Triflare Extend that ships with the server.
- `timeoutMs`: Wall-clock limit for one build; the process is killed when it passes. Defaults to `30000`.
- `memoryMb`: V8 heap cap for the build, in megabytes. Defaults to `192`.
- `addressSpaceMb`: Address-space limit (`ulimit -v`) for the build, in megabytes. Defaults to `1536`.
- `minify`: Minify compiled extension output with Terser before it is served. A pending version is minified when it is approved; a trusted account's version is minified at publish. The stored digest, size, and integrity hash describe the minified bytes. Defaults to `true`.

## 🌍 CORS and Logging

- `cors.allowedOrigins`: Origins allowed to call the API from a browser. Either `*`, or a list of origins compared exactly against the `Origin` header. A YAML list and one comma-separated string are both accepted. Defaults to `*`.
- `logging.requests`: Write one structured JSON line per request, in addition to the in-memory counters. Defaults to `false`.

## 🖥️ Editing Settings at Runtime

An admin can read and change a subset of these settings from the running instance through `GET` and `PUT` on `/admin/config` (under the API root), without redeploying. The file is edited in place, so comments and key order survive, and the change is written back to the same file the instance started from.

The endpoint only accepts its own allowlist: the public base URL, session lifetime, page sizes, size limits, compiler limits, request logging, and allowed origins. The database URL, port, API root, and data directory are not editable there — a typo in those is an instance that won't start, and the form would be an easier way to break one than a text editor.

Each setting is either applied immediately or needs a restart, and the response says which. The endpoint returns `409` if the configuration file isn't writable or wouldn't survive a redeploy — inside a container, that means the file has to be on a volume rather than in the image. With no file of your own, that is already the case: the default file sits in the data directory (`/app/data/config.yaml` in the image), which the [deploy guide](./deploy.md#-data-persistence) has you mount, and the first save creates it there.

## 🔑 Other Settings

These live in `config.yaml` beside the sections above:

- `environment`: `development` or `production`. Production turns on the checks that only make sense on a live instance. Defaults to `development`.
- `onboarding.completed`: Set by the first-run screen. A file with a `database.url` and no marker is treated as complete.
- `process.supervised`: Set to `true` when the process is started by something that will start it again (Docker's `restart: unless-stopped`, systemd's `Restart=always`). Without it, `POST /admin/system/restart` answers `409` rather than turning a restart request into an outage. Defaults to `false`.
- `process.drainSeconds`: How long a requested restart waits for in-flight requests before closing their connections. Defaults to `10`.
- `metrics.intervalMs`: How often the daily download rollup runs, in milliseconds. Defaults to one hour.
- `secrets.downloadHashKey`: Key used to hash client addresses for download statistics, so distinct downloads can be counted without storing the addresses. `null` generates one into `dataDir/secrets/download-address.key` on first use. Keep a real value in your secret store if you manage secrets outside the file.

`TRIFLARE_TEST_DATABASE_URL` is used only by the test suite; see [Development Guide](./development.md#-tests). It is not read by the server.
