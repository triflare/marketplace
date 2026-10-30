<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Changelog](#changelog)
  - [1.1.0](#110)
    - [Added](#added)
    - [Changed](#changed)
  - [1.0.0](#100)
    - [Added](#added-1)
    - [Changed](#changed-1)
    - [Deprecated](#deprecated)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Changelog

The API follows the version in the URL. This file records what changed in each released version, newest first. Anything under "Changed" that a client could notice is either additive within a major version or a new major.

## 1.1.0

Additive within `/v1`: the paths and response shapes 1.0.0 promised are unchanged, and everything below is a new endpoint, an optional parameter or header, or a new problem slug. The one thing a client has to adopt is `If-Match` on the three writes that edit a document in place — see "Changed". The whole suite reports 1.1.0.

### Added

- A driver layer for the instance's replaceable parts: authentication methods, mail, storage, the publish-time scanner, and the build compiler. `GET /auth` describes the sign-in methods an instance enables, so a client renders one control per method instead of assuming a password form.
- Sign-in methods beside password, OIDC and the device flow: `magic-link` (`POST /auth/magic-link`, `GET /auth/magic-link/verify`, `POST /auth/magic-link/complete`, `POST /auth/magic-link/exchange`), an emailed code (`POST /auth/email-otp`, `POST /auth/email-otp/verify`), passkey-first sign-in (`POST /auth/passkey/options`, `POST /auth/passkey/verify`), and a generated password shown once at registration (`POST /auth/magic-password/register`, `POST /auth/magic-password/rotate`). All of them run on `AuthIdentities`, so one account can hold several credentials and sign in with any of them.
- An email address as a sign-in identity: `GET /auth/email`, `POST /auth/email/change` (mails a code to the new address) and `POST /auth/email/confirm`. The account keeps the old address until the code is confirmed.
- Admin control over drivers and the process: `GET /admin/drivers` and `PUT /admin/drivers/{kind}` (verified before a swap, with `confirm` for changes that affect existing accounts and `?dryRun=1` for the numbers without applying), `GET /admin/system`, `POST /admin/system/reload`, and `POST /admin/system/restart`.
- `GET /admin/mail/outbox`, `GET /admin/mail/outbox/{id}` and `POST /admin/mail/outbox/{id}/retry`: every message is recorded before a provider sees it, and a failed delivery can be sent again down the chain.
- `Idempotency-Key` on the creations that are worth retrying — `POST /@{namespace}/{id}/versions`, `POST /tokens`, `POST /reports`, `POST /orgs`. A replay with the same key and body answers the first status and body with `Idempotent-Replayed: true`; a different body is a `422` (`/problems/idempotency-key-reused`), and a key whose request is still running is a `409` (`/problems/idempotency-in-progress`). Keys are scoped to the account and the route and expire after 24 hours.
- `If-Match` on `PATCH /users/{namespace}`, `PATCH /orgs/{namespace}` and `PATCH /@{namespace}/{id}/versions/{version}`. The header names the revision the edit was based on; omitting it is a `428` (`/problems/precondition-required`) and a superseded one is a `412` (`/problems/precondition-failed`). `*` is the client saying last-write-wins on purpose. The ETags these writes compare are revisions of the document, so the same profile read by its owner and by a passer-by validates against the same header.
- `?fields=id,name,downloads` on all 17 paged collections. The `data`/`_links` envelope stays; each item is trimmed to the keys named. At most 20 keys, and a list that names nothing the resource has is a `422`.
- `?include=owner,latestVersion` on `GET /@{namespace}/{id}`, so an extension page hydrates the publisher and the install line in one request.
- `RateLimit` and `RateLimit-Policy` on the rate-limited routes' successful responses as well as on the `429`, in the structured-field form of the IETF draft: what is left, when the window resets, and the quota it enforces.
- `410` (`/problems/gone`) for the versions of an extension whose address was deleted — distinct from the `404` a name that never existed gets, so a client can tell "removed" from "never existed".

### Changed

- The three in-place edits now require `If-Match`. This is the one place 1.1 asks a client to change: read the document, keep its `ETag`, and send it back with the write. Without it the write is refused rather than applied, because the alternative is two admins silently overwriting each other. `PATCH` bodies, response codes and shapes are unchanged.
- A request whose method the path does not accept answers `405` with an `Allow` header and `/problems/method-not-allowed`, instead of a `404` that read as "this endpoint is gone".
- `429` responses now carry `RateLimit` and `RateLimit-Policy` beside `Retry-After`, and the limited routes send them on the requests they do serve, so a client can pace itself instead of finding the ceiling by hitting it.
- Every package in the suite reports 1.1.0, including both `product.yml` files and `openapi/v1.yml`'s `info.version`.

## 1.0.0

The first versioned release. The whole suite is 1.0.0, and the API is served under `/v1`; `openapi/v1.yml` describes it.

### Added

- RFC 9457 problem documents with a stable `type` slug per failure, a `GET /problems` catalogue, and `GET /problems/{slug}` for a single entry.
- `X-Request-Id` on every response, echoed in the problem body as `requestId`.
- `WWW-Authenticate: Bearer` on `401` and `Retry-After` on `429`.
- `Link` headers for `next` and `prev` on paged collections.
- Weak `ETag` and `If-None-Match` handling on JSON `GET`s, `Cache-Control: no-store` on responses carrying a secret, and `private, no-store` on responses built around the caller's own credential.
- Problem types for the failures that used to borrow a bucket title: `already-sent`, `mail-unavailable`, `mail-delivery-failed`, `confirmation-required`, `configuration-read-only`, `reload-unavailable`, `not-supervised`, `restart-unavailable`, and `driver-verification-failed`.
- `GET /health`, `GET /ready`, `GET /` (a links index), `GET /openapi/v1.yml`, and `GET /docs`, all at the origin root.
- `q` on `GET /extensions`, which filters the listing on the same folded text `/search` used.
- `Location` on creations: accounts, sessions, tokens, reports, passkeys, publishes, and webhooks.
- gzip on JSON responses when the client offers it.

### Changed

- The API moved from `/v2` to `/v1`, and `openapi/v2.yml` became `openapi/v1.yml`. Paths inside the spec are unchanged; only the prefix and the spec filename moved.
- Every package in the suite reports 1.0.0, including `product.yml`, which is what `/v1/meta` reports.

### Deprecated

- `GET /search`. It still answers, and now sends `Deprecation` and `Sunset` headers plus a `Link` to `/extensions?q=`. Use `GET /extensions?q=` instead; `/search` goes away in 2.0.0.
