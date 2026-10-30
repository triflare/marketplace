import type { ProblemDetails } from "@/lib/api"
import { ApiError, ApiNetworkError } from "@/lib/api/errors"

import { officialApiUrl, product } from "@/lib/product"
import {
  isUnreachableStatus,
  reportRegistryReachable,
  reportRegistryUnreachable,
} from "@/lib/registry-status"
import { th } from "@/lib/remote-api"

const OFFICIAL_API = officialApiUrl
const LOCAL_API = "http://localhost:3000/v1"

// The browser no longer calls the API directly; these URLs are only used to
// build install links and copyable addresses that point at the registry.
const configured = import.meta.env.VITE_TRIFLARE_API_URL?.trim()
const fallback = import.meta.env.DEV ? LOCAL_API : OFFICIAL_API

export const API_BASE_URL = (configured || fallback).replace(/\/+$/, "")
export const API_ORIGIN = new URL(API_BASE_URL).origin
export const IS_OFFICIAL_INSTANCE =
  API_ORIGIN === new URL(officialApiUrl).origin
export const ASSET_PATH = "/__asset"
export const BADGE_PATH = "/__badge"

export { th }

// The CLI defaults to the official instance, so a command run against another
// instance has to say which one. Keep the flag out of official-instance copy.
export const CLI_HUB_URL_FLAG = IS_OFFICIAL_INSTANCE
  ? ""
  : ` --url ${API_BASE_URL}`

export interface DeviceCodeState {
  clientName: string
  expiresAt: string
  approved: boolean
  denied: boolean
}

// Device sign-in goes through a small server route instead of the /rpc proxy:
// it must work before a session exists, and the route holds the token itself.
async function deviceRequest<T>(
  path: string,
  body: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  const url = `/__device/${path}`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error
    }
    reportRegistryUnreachable()
    throw new ApiNetworkError("The device sign-in request failed.", {
      cause: error,
      method: "POST",
      url,
    })
  }

  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    if (response.ok) {
      throw new ApiError("The registry returned an unreadable response.", {
        status: response.status,
        method: "POST",
        url,
        body: text,
      })
    }
  }

  if (!response.ok) {
    const problem = data as { detail?: string; title?: string } | null
    if (isUnreachableStatus(response.status)) {
      reportRegistryUnreachable()
    } else {
      reportRegistryReachable()
    }
    throw new ApiError(
      problem?.detail ?? problem?.title ?? `HTTP ${response.status}`,
      {
        status: response.status,
        problem: (data as ProblemDetails | null) ?? undefined,
        method: "POST",
        url,
        body: text,
      }
    )
  }

  reportRegistryReachable()
  return data as T
}

export const deviceAuth = {
  lookup(userCode: string, options: { signal?: AbortSignal } = {}) {
    return deviceRequest<DeviceCodeState>(
      "lookup",
      { userCode },
      options.signal
    )
  },
  approve(userCode: string) {
    return deviceRequest<{ approved: true; clientName: string }>("approve", {
      userCode,
    })
  },
  deny(userCode: string) {
    return deviceRequest<{ denied: true }>("deny", { userCode })
  },
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiNetworkError) {
    return `We couldn’t reach ${product.name}. Check your connection and try again.`
  }

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Please sign in to continue."
    }
    if (error.status === 403) {
      return error.message || "You don’t have permission to do that."
    }
    if (error.status === 404) {
      return "We couldn’t find that page."
    }
    if (error.status === 429) {
      return "Too many attempts. Wait a few minutes and try again."
    }
    if (error.status >= 500) {
      return "Something went wrong on our end. Try again in a moment."
    }
    return error.message || "Something went wrong. Try again."
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Something went wrong."
}

export function assetUrl(value?: string | null): string | null {
  if (!value) {
    return null
  }

  if (/^data:/i.test(value)) {
    return value
  }

  if (/^https?:/i.test(value)) {
    try {
      const url = new URL(value)
      if (url.origin !== API_ORIGIN) {
        return value
      }
      return `${ASSET_PATH}?path=${encodeURIComponent(url.pathname + url.search)}`
    } catch {
      return value
    }
  }

  return `${ASSET_PATH}?path=${encodeURIComponent(value)}`
}

export function cursorFrom(link?: string | null): string | undefined {
  if (!link) {
    return undefined
  }

  try {
    return new URL(link, API_BASE_URL).searchParams.get("cursor") ?? undefined
  } catch {
    return undefined
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * The address an <img> can actually load. Badges are the one registry response
 * the browser used to collect itself; this points at our own server, which
 * fetches the SVG. Copyable markdown still names the registry, since the badge
 * is embedded on sites this server is not in the path of.
 */
export function badgeUrl(
  namespace: string,
  id: string,
  field?: "version" | "downloads" | "license"
): string {
  const path = `${BADGE_PATH}/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}`
  return field ? `${path}/${field}` : path
}

export function downloadUrl(
  namespace: string,
  id: string,
  version: string
): string {
  return `${API_BASE_URL}/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`
}

export function sourceUrl(
  namespace: string,
  id: string,
  version: string
): string {
  return `${API_BASE_URL}/@${encodeURIComponent(namespace)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/source`
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the selection-based copy when permission is denied.
    }
  }

  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.top = "0"
  field.style.left = "-9999px"
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  if (!copied) {
    throw new Error("Copy failed")
  }
}
