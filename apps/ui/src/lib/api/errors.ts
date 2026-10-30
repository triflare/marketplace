import type { ProblemDetails } from "./types"

export interface ApiErrorOptions {
  status?: number
  problem?: ProblemDetails
  method?: string
  url?: string
  headers?: Headers
  retryAfter?: number
  body?: string
  cause?: unknown
}

// An HTTP failure carries the API's RFC 7807 problem document. A transport
// failure keeps `status` at 0 instead, which is how callers tell "the registry
// said no" from "the request never reached the registry".
export class ApiError extends Error {
  status: number
  problem?: ProblemDetails
  method?: string
  url?: string
  headers?: Headers
  retryAfter?: number
  body?: string

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = "ApiError"
    this.status = options.status ?? 0
    this.problem = options.problem
    this.method = options.method
    this.url = options.url
    this.headers = options.headers
    this.retryAfter = options.retryAfter
    this.body = options.body
  }
}

export class ApiNetworkError extends ApiError {
  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message, options)
    this.name = "ApiNetworkError"
  }
}
