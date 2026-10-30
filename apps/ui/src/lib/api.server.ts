import "@/lib/env.server"
import { createHash } from "node:crypto"

import { ApiClient } from "@/lib/api"
import type { EtagStore } from "@/lib/api"

import { officialApiUrl } from "@/lib/product"

const LOCAL_API = "http://localhost:3000/v1"

const configured =
  process.env.TRIFLARE_API_URL?.trim() ??
  process.env.VITE_TRIFLARE_API_URL?.trim()

const fallback =
  process.env.NODE_ENV === "production" ? officialApiUrl : LOCAL_API

export const SERVER_API_URL = (configured || fallback).replace(/\/+$/, "")

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
  const api = new ApiClient(SERVER_API_URL, { etags: storeFor(credential) })
  if (token) {
    api.setToken(token)
  }
  return api
}
