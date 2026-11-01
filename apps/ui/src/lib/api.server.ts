import { createHash } from "node:crypto"

import { ApiClient } from "@/lib/api"
import type { EtagStore } from "@/lib/api"
import { getConfig, publicApiUrl } from "@/lib/config.server"
import { officialApiUrl } from "@/lib/product"

const LOCAL_API = "http://localhost:3000/v1"

/** The address this process uses to reach the registry. */
export function serverApiUrl(): string {
  const configured = getConfig().api.url
  const fallback = officialApiUrl || LOCAL_API
  return (configured || fallback).replace(/\/+$/, "")
}

/** The address a visitor's browser uses for the registry. */
export function browserApiUrl(): string {
  return publicApiUrl()
}

// The revision of each document this credential has read. The RPC route builds
// an ApiClient per request, so the memory cannot live on a client instance: it
// is keyed by the token, because one browser may hold several accounts and a
// revision read as one of them must not be named by another.
const revisions = new Map<string, Map<string, string>>()

// Bounds for a long-lived process: a browser that browses a lot of extensions
// would otherwise remember a revision per path forever, and every account that
// ever signed in would keep its own map.
const MAX_PATHS = 200
const MAX_CREDENTIALS = 500

function storeFor(credential: string): EtagStore {
  let entries = revisions.get(credential)
  if (!entries) {
    entries = new Map<string, string>()
    revisions.set(credential, entries)
    if (revisions.size > MAX_CREDENTIALS) {
      const oldest = revisions.keys().next().value
      if (oldest !== undefined) revisions.delete(oldest)
    }
  }
  const store = entries
  return {
    get: (path) => store.get(path),
    set: (path, tag) => {
      // Re-inserted so the iteration order below is "least recently written",
      // which is the entry worth dropping when the map is full.
      store.delete(path)
      store.set(path, tag)
      if (store.size > MAX_PATHS) {
        const oldest = store.keys().next().value
        if (oldest !== undefined) store.delete(oldest)
      }
    },
    delete: (path) => {
      store.delete(path)
    },
  }
}

export function serverApi(token?: string | null): ApiClient {
  // The map key names the memory rather than being it: the digest of the token
  // is enough to tell two credentials apart without keeping the secret around
  // in a second place.
  const credential = token
    ? createHash("sha256").update(token).digest("base64url")
    : "anonymous"
  const api = new ApiClient(serverApiUrl(), { etags: storeFor(credential) })
  if (token) {
    api.setToken(token)
  }
  return api
}
