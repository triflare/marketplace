import { ApiError, ApiNetworkError } from "./errors"
import type { ApiClientOptions, EtagStore, RequestOptions } from "./types"

export type ResponseType = "json" | "text" | "blob" | "none" | "raw"

export interface HttpRequestOptions extends RequestOptions {
  method?: string
  query?: Record<string, unknown>
  json?: unknown
  body?: BodyInit | null
  contentType?: string
  responseType?: ResponseType
  redirect?: RequestRedirect
  headers?: Record<string, string>
}

const ACCEPT_BY_TYPE: Record<ResponseType, string> = {
  json: "application/json",
  text: "*/*",
  blob: "*/*",
  none: "*/*",
  raw: "*/*",
}

// Path segments go through encodeURIComponent so a namespace, version, or tag
// can never be read as part of the URL structure.
export function pathValue(value: string | number, name: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`${name} must be a string or number`)
  }
  const text = String(value)
  if (text.length === 0) {
    throw new TypeError(`${name} must not be empty`)
  }
  return encodeURIComponent(text)
}

export function extensionPath(namespace: string, id: string): string {
  return `/@${pathValue(namespace, "namespace")}/${pathValue(id, "extension id")}`
}

// Query keys the caller left alone are dropped rather than sent as "undefined".
export function pickQuery(
  input: object | undefined,
  keys: string[]
): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  if (!input) return query
  const source = input as Record<string, unknown>
  for (const key of keys) {
    if (source[key] !== undefined) query[key] = source[key]
  }
  return query
}

export function requestOptions(options: RequestOptions = {}): RequestOptions {
  const result: RequestOptions = {}
  if (options.signal !== undefined) result.signal = options.signal
  if (options.timeoutMs !== undefined) result.timeoutMs = options.timeoutMs
  return result
}

function appendQuery(
  searchParams: URLSearchParams,
  query: Record<string, unknown>
) {
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          searchParams.append(name, String(item))
        }
      }
    } else {
      searchParams.append(name, String(value))
    }
  }
}

function combineSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined
) {
  const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
  if (!signal) return timeoutSignal
  if (!timeoutSignal) return signal
  return AbortSignal.any([signal, timeoutSignal])
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
}

function networkError(
  error: unknown,
  details: { method: string; url: string; timeoutMs?: number }
): ApiNetworkError {
  const name = error instanceof Error ? error.name : ""
  let message: string
  if (name === "TimeoutError") {
    message = details.timeoutMs
      ? `Request to ${details.url} timed out after ${details.timeoutMs} ms`
      : `Request to ${details.url} timed out`
  } else if (name === "AbortError") {
    message = `Request to ${details.url} was aborted`
  } else {
    const detail = error instanceof Error ? error.message : String(error)
    message = `Unable to reach ${details.url}: ${detail}`
  }
  return new ApiNetworkError(message, {
    method: details.method,
    url: details.url,
    cause: error,
  })
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return Number.isFinite(seconds) ? seconds : undefined
  }
  const date = Date.parse(trimmed)
  if (!Number.isFinite(date)) return undefined
  return Math.max(0, (date - Date.now()) / 1000)
}

function problemMessage(problem: unknown, response: Response): string {
  let message = `Request failed with status ${response.status}`
  if (response.statusText) message += ` (${response.statusText})`
  if (!problem || typeof problem !== "object") return message

  const detail = problem as {
    detail?: unknown
    title?: unknown
    errors?: unknown
  }
  if (typeof detail.detail === "string" && detail.detail.length > 0) {
    message = detail.detail
  } else if (typeof detail.title === "string" && detail.title.length > 0) {
    message = detail.title
  }
  if (Array.isArray(detail.errors) && detail.errors.length > 0) {
    const fields = detail.errors
      .map(
        (entry: { field: string; message: string }) =>
          `${entry.field}: ${entry.message}`
      )
      .join(", ")
    message += ` (${fields})`
  }
  return message
}

async function httpError(response: Response, method: string, url: string) {
  const body = await response.text()
  let problem: unknown
  if (body) {
    try {
      problem = JSON.parse(body)
    } catch {
      problem = undefined
    }
  }
  const valid = problem && typeof problem === "object" ? problem : undefined
  return new ApiError(problemMessage(valid, response), {
    status: response.status,
    problem: valid as ApiError["problem"],
    method,
    url,
    headers: response.headers,
    retryAfter: parseRetryAfter(response.headers.get("retry-after")),
    body,
  })
}

async function readResponse(response: Response, options: HttpRequestOptions) {
  const responseType = options.responseType ?? "json"
  if (responseType === "raw") return response
  if (response.status === 204 || response.status === 205) return undefined
  if (responseType === "none") return undefined
  if (responseType === "blob") return response.blob()

  const text = await response.text()
  if (responseType === "text") return text
  if (text === "") return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ApiError(`Expected JSON from ${response.url}`, {
      status: response.status,
      method: options.method,
      url: response.url,
      headers: response.headers,
      body: text,
      cause: error,
    })
  }
}

// The default memory: a client that is reused (the browser's own, a test's)
// remembers what it read for as long as it lives.
function mapStore(): EtagStore {
  const entries = new Map<string, string>()
  return {
    get: (path) => entries.get(path),
    set: (path, tag) => {
      entries.set(path, tag)
    },
    delete: (path) => {
      entries.delete(path)
    },
  }
}

function normalizeBaseUrl(value: string | URL): string {
  const text = value instanceof URL ? value.toString() : String(value ?? "")
  if (text.trim() === "") {
    throw new TypeError("The API base URL is required")
  }
  const url = new URL(text)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("The API base URL must use http or https")
  }
  if (url.search || url.hash) {
    throw new TypeError("The API base URL must not contain a query or fragment")
  }
  return url.toString().replace(/\/+$/, "")
}

// The one place a request is built and sent. Resource modules stay declarative:
// they describe the path, the payload, and the shape of the answer.
export class HttpClient {
  baseUrl: string
  token: string | null
  #fetch: typeof fetch
  #headers: Record<string, string>
  #timeoutMs?: number
  // The revision of each document this client has read, so a write can name the
  // state it is based on. The API refuses a write without one (428), and one
  // that names a superseded revision (412). Callers that build a client per
  // request (the web app's RPC route) pass a store that outlives the client.
  #etags: EtagStore

  constructor(baseUrl: string | URL, options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.token = options.token || null
    this.#headers = options.headers ?? {}
    this.#timeoutMs = options.timeoutMs ?? undefined
    this.#etags = options.etags ?? mapStore()
    this.#fetch =
      typeof options.fetch === "function"
        ? options.fetch
        : globalThis.fetch.bind(globalThis)
  }

  setToken(token: string | null | undefined) {
    this.token = token || null
  }

  async request<T = unknown>(
    path: string,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const response = await this.send(path, options)
    try {
      const body = await readResponse(response, options)
      // An account is one document behind two addresses: the caller's own
      // `/me` and its `/users/{namespace}`. A profile edit names the latter, so
      // the revision read from either has to be remembered for both.
      if (path === "/me") {
        const namespace = (body as { namespace?: unknown } | undefined)?.namespace
        const tag = response.headers.get("etag")
        if (typeof namespace === "string" && tag) {
          this.#etags.set(`/users/${namespace}`, tag)
        }
      }
      return body as T
    } catch (error) {
      if (!isAbortError(error)) throw error
      throw networkError(error, {
        method: options.method ?? "GET",
        url: this.buildUrl(path, options.query),
        timeoutMs: options.timeoutMs ?? this.#timeoutMs,
      })
    }
  }

  async raw(path: string, options: HttpRequestOptions = {}): Promise<Response> {
    return this.send(path, options)
  }

  // `retried` marks the second attempt at a write whose first attempt named no
  // revision. It is set at most once, so a document that keeps refusing cannot
  // loop the request.
  private async send(
    path: string,
    options: HttpRequestOptions,
    retried = false
  ): Promise<Response> {
    const method = options.method ?? "GET"
    const url = this.buildUrl(path, options.query)
    const headers = this.buildHeaders(options)
    const conditional = method !== "GET" && method !== "HEAD"
    const known = this.#etags.get(path)
    const hadIfMatch = headers.has("if-match")
    if (conditional && known && !hadIfMatch) {
      headers.set("if-match", known)
    }
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs
    const signal = combineSignals(options.signal, timeoutMs)
    const body =
      options.json !== undefined ? JSON.stringify(options.json) : options.body

    let response: Response
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: body as BodyInit | null | undefined,
        signal,
        redirect: options.redirect,
      })
    } catch (error) {
      throw networkError(error, { method, url, timeoutMs })
    }

    if (response.status === 412 || response.status === 428) {
      // The remembered revision is not one the server will accept any more;
      // the caller has to read the document again.
      this.#etags.delete(path)
    }

    // 428 says the write did not name a revision at all, which is this client
    // having missed the document rather than someone else having changed it.
    // Read the current one and try the same write once more; a 412 is a real
    // conflict and is left for the caller to show.
    if (
      response.status === 428 &&
      !retried &&
      !hadIfMatch &&
      (method === "PATCH" || method === "DELETE")
    ) {
      const current = await this.#fetch(this.buildUrl(path), {
        method: "GET",
        // Built the same way as any other request, so the token that may write
        // the document is the one reading it back.
        headers: this.buildHeaders({}),
        signal,
      }).catch(() => null)
      const tag = current?.headers.get("etag")
      if (current?.ok && tag) {
        this.#etags.set(path, tag)
        return this.send(path, options, true)
      }
    }
    if (response.status >= 200 && response.status < 300) {
      const tag = response.headers.get("etag")
      if (tag) this.#etags.set(path, tag)
    }

    if (response.status >= 400) {
      try {
        throw await httpError(response, method, url)
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (!isAbortError(error)) throw error
        throw networkError(error, { method, url, timeoutMs })
      }
    }
    return response
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const suffix = path.startsWith("/") ? path : `/${path}`
    const url = new URL(`${this.baseUrl}${suffix}`)
    if (query) appendQuery(url.searchParams, query)
    return url.toString()
  }

  private buildHeaders(options: HttpRequestOptions): Headers {
    const responseType = options.responseType ?? "json"
    const headers = new Headers(this.#headers)
    if (!headers.has("accept")) {
      headers.set("accept", ACCEPT_BY_TYPE[responseType])
    }
    if (this.token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${this.token}`)
    }
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      headers.set(name, value)
    }
    if (options.json !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }
    if (options.contentType && !headers.has("content-type")) {
      headers.set("content-type", options.contentType)
    }
    return headers
  }
}
