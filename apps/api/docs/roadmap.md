# 🗺️ API Roadmap

The API is at 1.1.0 and served under `/v1`. This page records what the `/v1` surface promises, what has shipped, what is left to do, and the order it is meant to happen in. Anything listed as shipped is implemented, and the versioned operations are described in `openapi/v1.yml`; the client-visible detail of each release is in `CHANGELOG.md`.

## 📕 Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [What 1.x commits to](#what-1x-commits-to)
- [Shipped in 1.0](#shipped-in-10)
- [Shipped in 1.1](#shipped-in-11)
- [Next: 1.2](#next-12)
- [Later: 2.0](#later-20)
- [Deliberately not planned](#deliberately-not-planned)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## What 1.x commits to

The version is a promise about the request and response shapes, not about the implementation. Within `/v1`:

- A field is not removed or renamed, and its type does not change.
- An existing status code is not put to a different use.
- A new required request field does not appear. A header that a write newly insists on is the exception the changelog names explicitly, and a release that adds one says what a client has to do.
- The meaning of a cursor is not changed mid-stream; a cursor that a running instance issued keeps working until it expires.
- A new error `type` slug may appear. Clients branch on `status`, and on the slug where they handle that specific failure.

Adding endpoints, optional parameters, response fields, and new slugs is a minor bump. Everything else is `/v2`.

## Shipped in 1.0

- One surface, one prefix: every resource path in `openapi/v1.yml` is mounted under `/v1` and nowhere else, and the spec's `servers` block names it. The instance endpoints (`/health`, `/ready`, `/problems`, `/openapi/v1.yml`, `/docs`, `/`) sit at the origin root because they describe the process, not a versioned resource; they are outside the versioning scheme on purpose, not an alias of it.
- Errors are RFC 9457 problem documents: `type` is a resolvable `/problems/<slug>` URL, `title` is the catalogue's wording for that type and never varies within it, `detail` explains this occurrence, `instance` is the request URL, `requestId` matches the `X-Request-Id` header.
- `GET /problems` lists the catalogue and `GET /problems/{slug}` serves one entry, so a client can resolve a type without leaving the instance.
- Every response carries `X-Request-Id`; a caller-supplied one is kept when it is 128 characters or fewer of `[A-Za-z0-9._:-]`.
- `401` responses carry `WWW-Authenticate: Bearer`, naming `invalid_token` when a token was presented. `429` carries `Retry-After`.
- A collection page with a neighbour in either direction carries the matching `Link` header (`rel="next"`, `rel="prev"`) alongside `_links`, so a plain HTTP client can page without parsing the body.
- A JSON `GET` carries a weak `ETag` and honours `If-None-Match` with `304`. A response that carries a token, password, backup code, or shared secret sends `Cache-Control: no-store`; one built around the caller's credential sends `private, no-store`.
- Responses above a kilobyte are gzipped when the client offers it.
- `GET /health` answers liveness, `GET /ready` checks the database, and `GET /` is a links index of the surface.
- `GET /openapi/v1.yml` serves the spec this instance is running, and `GET /docs` is a readable page pointing at it.
- `q` filters `GET /extensions` on the same folded text the deprecated `/search` used, so listing and searching are one operation with an optional filter.
- `POST` responses that create an addressable resource send `Location`: accounts, sessions, tokens, reports, passkeys, publishes, and account/extension/organization webhooks.

## Shipped in 1.1

Everything 1.0 promised still holds; 1.1 is additive except for the one write-header change named in `CHANGELOG.md`.

- **Drivers.** Authentication, mail, storage, the publish-time scanner, and the compiler are modules an instance configures rather than code it was built with. `GET /auth` advertises the sign-in methods, `GET /admin/drivers` reports every instance and its health, and `PUT /admin/drivers/{kind}` swaps one after verifying it. A swap that would strand existing accounts reports how many and waits for `confirm: true`; `?dryRun=1` returns the numbers without applying.
- **More ways to sign in.** Magic links, emailed one-time codes, passkey-first sign-in, and a generated password shown once at registration, all on `AuthIdentities` so one account can carry several credentials. A new address is confirmed by code before it becomes the account's email (`POST /auth/email/change`, `POST /auth/email/confirm`).
- **Mail an operator can see.** Every message is written to the outbox before a provider sees it, and `GET /admin/mail/outbox` plus `POST /admin/mail/outbox/{id}/retry` make a delivery failure something to read and repeat rather than guess at.
- **Reload and restart.** `POST /admin/system/reload` rebuilds the config, drivers, routers and rate limiter behind the still-open socket; `POST /admin/system/restart` drains and exits for a supervisor to start again, and refuses with `409` when nothing is supervising the process.
- **Idempotency keys.** `Idempotency-Key` on the creations worth retrying (a publish, a token, a report, an organization). The first request stores its answer; a replay returns it with `Idempotent-Replayed: true`. Reusing a key for a different body is a `422`, and a key whose request is still running is a `409`.
- **`If-Match` on the mutable documents.** Account, organization and version edits name the revision they are based on. Missing is a `428`, superseded is a `412`, and `*` is the client choosing last-write-wins on purpose. This is what stops two admins overwriting each other's edits.
- **`fields` and `include`.** `?fields=` trims any collection to the keys named, and `?include=owner,latestVersion` folds those relations into `GET /@{namespace}/{id}` so an extension page is one request.
- **Rate-limit headers.** `RateLimit` and `RateLimit-Policy` on the limited routes' successful responses as well as on the `429`, following the IETF draft, so a client can pace itself.
- **Honest status codes.** A known path with an unsupported method is a `405` with `Allow` instead of a `404`, and the versions of a deleted extension are a `410` rather than a `404` that reads as "never existed".

## Next: 1.2

- Registration policy beyond `open` and `closed`: `invite` and `allowlist`, which are refused at startup today. Both need a place to keep invitations, so they land with the outbox messages that carry them.
- A `drivers_revision` row and `LISTEN/NOTIFY` so a driver change reaches every replica. Today it applies to the one that served the `PUT`, which is the honest limit of a single-replica instance; blobs on local disk already need shared storage for more than one.
- A documented storage migration: switching `storage` from `local` to `s3` leaves the existing digests behind, so it is gated on a walk that copies them rather than applied like a mail key.
- A second call site for the kinds that have an interface and no provider: `cache` (rate limiting is DB-backed), durable `jobs` backends, remote `search`, `notify` channels other than in-app, and `metrics/otlp`. Each is refused at startup today rather than silently ignored.
- OAuth2 presets for the providers people actually deploy (`github`, `discord`, `gitlab`), which is the same `begin`/`complete` contract with the endpoints filled in.
- Per-purpose mail routing, so security mail can go through a different provider than notifications. Deliberately one chain until there is a second reason for another.

## Later: 2.0

- Version negotiation in the path only. No `Accept`-based versioning: a cache key that ignores a header is a cache that serves the wrong body.
- Pagination moves from keyset-in-a-cursor to a documented `page` token with an explicit `next` URL lifetime, once the current cursors have shipped long enough to measure how often clients hand-build them.
- `GET /@{namespace}/{id}/versions/{version}/download` becomes a redirect to an immutable address rather than serving bytes itself, so a CDN can cache one URL per version instead of one per extension.
- Webhook payloads get their own version field and a documented replay window; today a delivery is fire-and-retry with a signature over the body and no payload schema guarantee.
- `GET /search` is removed, two releases after it started sending `Deprecation` and `Sunset`.

## Deliberately not planned

- A GraphQL endpoint. The registry is a small, read-heavy REST surface with two write paths; a second query language would be a second set of authorization rules to keep right.
- Unversioned aliases such as `/api/extensions` pointing at the current major. They make a breaking change invisible to the client that depended on it.
- Content negotiation on error media types. `application/problem+json` is the answer; a client that asked for `application/json` still gets a problem document.
